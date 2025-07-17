import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuCartItem } from "../entities/MenuCartItem";
import { MenuItem } from "../entities/MenuItem";
import { MenuPurchase } from "../entities/MenuPurchase";
import { MenuPurchaseTransaction } from "../entities/MenuPurchaseTransaction";
import { calculateGatewayFees, calculatePlatformFee } from "../utils/menuFeeUtils";
import { generateEncryptedQR } from "../utils/generateEncryptedQR";
import { sendMenuEmail } from "../services/emailService";
import { isDisposableEmail } from "../utils/disposableEmailValidator";
import { User } from "../entities/User";
import { mockValidateWompiTransaction } from "../services/mockWompiService";
import { AuthenticatedRequest } from "../types/express";
import QRCode from "qrcode";

export const processSuccessfulMenuCheckout = async ({
  userId,
  sessionId,
  email,
  req,
  res,
  transactionId,
}: {
  userId: string | null;
  sessionId: string | null;
  email: string;
  req: Request;
  res: Response;
  transactionId?: string;
}): Promise<Response> => {
  const cartRepo = AppDataSource.getRepository(MenuCartItem);
  const itemRepo = AppDataSource.getRepository(MenuItem);
  const purchaseRepo = AppDataSource.getRepository(MenuPurchase);
  const transactionRepo = AppDataSource.getRepository(MenuPurchaseTransaction);
  const userRepo = AppDataSource.getRepository(User);

  const where = userId !== null ? { userId } : sessionId !== null ? { sessionId } : undefined;
  if (!where) return res.status(400).json({ error: "Missing session or user" });

  const cartItems = await cartRepo.find({
    where,
    relations: ["menuItem", "variant", "menuItem.club"],
  });

  if (!cartItems.length) return res.status(400).json({ error: "Cart is empty" });

  const clubId = cartItems[0].clubId;
  const user = userId ? await userRepo.findOneBy({ id: userId }) : undefined;

  let totalPaid = 0;
  let clubReceives = 0;
  let platformReceives = 0;
  let gatewayFeeTotal = 0;
  let gatewayIVATotal = 0;

  const menuPurchases: MenuPurchase[] = [];

  for (const item of cartItems) {
    const rawPrice = item.variant?.price ?? item.menuItem.price!;
    const price = Number(rawPrice);
    if (isNaN(price)) {
      console.error(`[❌] Invalid price for menuItemId: ${item.menuItemId}`);
      continue; // skip this item to avoid corrupt totals
    }

    const platformFee = calculatePlatformFee(price, 0.025);
    const { totalGatewayFee, iva } = calculateGatewayFees(price);

    const userPaid = price + platformFee + totalGatewayFee + iva;
    const quantity = item.quantity;

    totalPaid += userPaid * quantity;
    clubReceives += price * quantity;
    platformReceives += platformFee * quantity;
    gatewayFeeTotal += totalGatewayFee * quantity;
    gatewayIVATotal += iva * quantity;

    const purchase = purchaseRepo.create({
      menuItemId: item.menuItemId,
      variantId: item.variantId ?? undefined,
      quantity,
      pricePerUnit: price,
      clubId: item.clubId,
      clubReceives: price,
      platformReceives: platformFee,
      platformFeeApplied: 0.025,
      userId,
      sessionId,
    });

    menuPurchases.push(purchase);
  }

  const payload = {
    id: transactionId ?? `mock-${Date.now()}`,
    clubId,
    type: "menu" as const
  };

  const encryptedPayload = await generateEncryptedQR(payload);
  const qrImageDataUrl = await QRCode.toDataURL(encryptedPayload);

  const transaction = transactionRepo.create({
    clubId,
    sessionId: sessionId ?? undefined,
    userId: userId ?? undefined,
    totalPaid,
    clubReceives,
    platformReceives,
    gatewayFee: gatewayFeeTotal,
    gatewayIVA: gatewayIVATotal,
    qrPayload: encryptedPayload,
    paymentProvider: "mock",
    paymentStatus: "PENDING",
    ...(transactionId ? { paymentProviderTransactionId: transactionId } : {}),
    email,
  });

  for (const purchase of menuPurchases) {
    purchase.transaction = transaction;
  }

  await transactionRepo.save(transaction);
  await purchaseRepo.save(menuPurchases);

  await sendMenuEmail({
    to: email,
    qrImageDataUrl,
    clubName: cartItems[0].menuItem.club?.name ?? "Your Club",
    items: cartItems.map((item) => ({
      name: item.menuItem.name,
      variant: item.variant?.name ?? null,
      quantity: item.quantity,
      unitPrice: item.variant?.price ?? item.menuItem.price!,
    })),
      total: totalPaid, 
  });

  if (userId) {
    await cartRepo.delete({ userId });
  } else if (sessionId) {
    await cartRepo.delete({ sessionId });
  }

  return res.json({
    message: "Menu checkout completed",
    transactionId: transaction.id,
    totalPaid,
    items: menuPurchases.map((p) => ({
      itemId: p.menuItemId,
      variantId: p.variantId,
      pricePerUnit: p.pricePerUnit,
    })),
  });
};

export const checkoutMenu = async (req: Request, res: Response): Promise<Response> => {
  const typedReq = req as AuthenticatedRequest;
  const userId = typedReq.user?.id ?? null;
  const sessionId = !userId && typedReq.sessionId ? typedReq.sessionId : null;
  const email: string | undefined = typedReq.user?.email ?? typedReq.body?.email;

  if (!email) {
    return res.status(400).json({ error: "Email is required for checkout" });
  }

  if (!req.user && isDisposableEmail(email)) {
    return res.status(403).json({ error: "Disposable email domains are not allowed" });
  }

  return await processSuccessfulMenuCheckout({ userId, sessionId, email, req, res });
};

export const confirmMockMenuCheckout = async (req: Request, res: Response): Promise<Response> => {
  const typedReq = req as AuthenticatedRequest;
  const userId = typedReq.user?.id ?? null;
  const sessionId = !userId && typedReq.sessionId ? typedReq.sessionId : null;
  const email = typedReq.body.email;
  const transactionId = typedReq.body.transactionId;

  if (!email || !transactionId) {
    return res.status(400).json({ error: "Missing email or transaction ID" });
  }

  const wompiResponse = await mockValidateWompiTransaction(transactionId);
  if (!wompiResponse.approved) {
    return res.status(400).json({ error: "Mock transaction not approved" });
  }

  return processSuccessfulMenuCheckout({
    userId,
    sessionId,
    email,
    req,
    res,
    transactionId,
  });
};
