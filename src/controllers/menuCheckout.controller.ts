import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuCartItem } from "../entities/MenuCartItem";
import { MenuItem } from "../entities/MenuItem";
import { MenuItemVariant } from "../entities/MenuItemVariant";
import { MenuPurchase } from "../entities/MenuPurchase";
import { MenuPurchaseTransaction } from "../entities/MenuPurchaseTransaction";
import { calculateGatewayFees, calculatePlatformFee } from "../utils/menuFeeUtils";
import { generateEncryptedQR } from "../utils/generateEncryptedQR";
import { User } from "../entities/User";

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
    relations: ["menuItem", "variant"],
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
    const price = item.variant?.price ?? item.menuItem.price!;
    const platformFee = calculatePlatformFee(price, 0.025);
    const { totalGatewayFee, iva } = calculateGatewayFees(price);

    const userPaid = price + platformFee + totalGatewayFee + iva;
    const quantity = item.quantity;

    totalPaid += userPaid * quantity;
    clubReceives += price * quantity;
    platformReceives += platformFee * quantity;
    gatewayFeeTotal += totalGatewayFee * quantity;
    gatewayIVATotal += iva * quantity;

    const menuPurchase = purchaseRepo.create({
      menuItemId: item.menuItemId,
      variantId: item.variantId ?? undefined,
      quantity,
      pricePerUnit: price,
      clubId: item.clubId,
      clubReceives: price,
      platformReceives: platformFee,
      platformFeeApplied: 0.025,
      user: user ?? undefined,
    });

    menuPurchases.push(menuPurchase);
  }

  const qrPayload = {
    email,
    clubId,
    menuPurchases: menuPurchases.map((p) => ({
      itemId: p.menuItemId,
      variantId: p.variantId,
      qty: p.quantity,
    })),
  };

  const encryptedPayload = await generateEncryptedQR({
  type: "menu",
  transactionId: transactionId ?? `mock-${Date.now()}`,
  email,
  userId,
  sessionId,
  timestamp: new Date().toISOString()
  });

  const transaction = transactionRepo.create({
    email,
    clubId,
    sessionId: sessionId ?? undefined,
    user: user ?? undefined,
    totalPaid,
    clubReceives,
    platformReceives,
    gatewayFee: gatewayFeeTotal,
    gatewayIVA: gatewayIVATotal,
    qrPayload: encryptedPayload,
    paymentProvider: "mock",
    paymentStatus: "PENDING",
    ...(transactionId ? { paymentProviderTransactionId: transactionId } : {}),
  });

  await transactionRepo.save(transaction);

  for (const purchase of menuPurchases) {
    purchase.transaction = transaction;
  }

  await purchaseRepo.save(menuPurchases);

  if (userId) {
    await cartRepo.delete({ userId });
  } else if (sessionId) {
    await cartRepo.delete({ sessionId });
  }

  return res.json({
    message: "Menu checkout initialized (pending payment)",
    transactionId: transaction.id,
    totalPaid,
  });
};
