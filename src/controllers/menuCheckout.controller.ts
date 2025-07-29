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
import { computeDynamicPrice } from "../utils/dynamicPricing";
import { getMenuCommissionRate } from "../config/fees";

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
  let totalClubReceives = 0;
  let totalPlatformReceives = 0;
  let totalGatewayFee = 0;
  let totalGatewayIVA = 0;

  const menuPurchases: MenuPurchase[] = [];

  // 🎯 Calculate menu totals first (before gateway fees)
  for (const item of cartItems) {
    const club = item.menuItem.club;
    const hasVariants = item.menuItem.hasVariants;

    let basePrice: number;

    if (hasVariants) {
      const variantPrice = Number(item.variant?.price);
      if (isNaN(variantPrice)) {
        console.error(`[❌] Invalid price for menuItemId: ${item.menuItemId}`);
        continue; // skip this item to avoid corrupt totals
      }
      basePrice = variantPrice;
    } else {
      if (typeof item.menuItem.price !== "number") {
        console.error(`[❌] Menu item has no price — MenuItem ID: ${item.menuItem.id}`);
        return res.status(500).json({
          error: `Internal error: Price missing for item "${item.menuItem.name}"`,
        });
      }
      basePrice = item.menuItem.price;
    }

    // 🎯 Apply dynamic pricing if enabled
    let dynamicPrice = basePrice;
    let dynamicPricingReason: string | undefined;
    


    if (hasVariants && item.variant?.dynamicPricingEnabled) {
      // Variant has dynamic pricing enabled
      dynamicPrice = computeDynamicPrice({
        basePrice,
        clubOpenDays: club.openDays,
        openHours: club.openHours, // Pass the array directly, not a string
      });
    } else if (!hasVariants && item.menuItem.dynamicPricingEnabled) {
      // Menu item has dynamic pricing enabled
      dynamicPrice = computeDynamicPrice({
        basePrice,
        clubOpenDays: club.openDays,
        openHours: club.openHours, // Pass the array directly, not a string
      });
    }

    // Determine dynamic pricing reason
    if (dynamicPrice !== basePrice) {
      const now = new Date();
      const openHoursArr = Array.isArray(club.openHours) ? club.openHours : [];
      if (openHoursArr.length > 0) {
        const [openHourNum] = openHoursArr[0].open.split(':').map(Number);
        const [closeHourNum] = openHoursArr[0].close.split(':').map(Number);
        const currentHour = now.getHours();
        console.log(`   Current hour: ${currentHour}, Open: ${openHourNum}, Close: ${closeHourNum}`);
        if (currentHour < openHourNum || currentHour >= closeHourNum) {
          dynamicPricingReason = "closed_day";
        } else {
          dynamicPricingReason = "early";
        }
        console.log(`   Time-based reason: ${dynamicPricingReason}`);
      }
    }

    const platformFee = calculatePlatformFee(dynamicPrice, getMenuCommissionRate()); // 10% for menu items
    const quantity = item.quantity;

    console.log(`🍽️ [MENU-CHECKOUT] Item: ${item.menuItem.name}${item.variant ? ` (${item.variant.name})` : ''}`);
    console.log(`   Base Price: ${basePrice}`);
    console.log(`   Dynamic Price: ${dynamicPrice}`);
    console.log(`   Quantity: ${quantity}`);
    console.log(`   Item Total: ${dynamicPrice * quantity} (${dynamicPrice} × ${quantity})`);
    console.log(`   Platform Fee Rate: ${getMenuCommissionRate() * 100}%`);
    console.log(`   Platform Fee: ${platformFee * quantity} (${platformFee} × ${quantity})`);
    console.log(`   Item Total + Platform Fee: ${(dynamicPrice + platformFee) * quantity}`);
    console.log(`   ---`);

    // Add to transaction totals
    totalPaid += (dynamicPrice + platformFee) * quantity;
    totalClubReceives += dynamicPrice * quantity;
    totalPlatformReceives += platformFee * quantity;
  }

  // 🎯 Calculate transaction-level gateway fees based on the actual totalPaid
  const { totalGatewayFee: transactionGatewayFee, iva: transactionIVA } = calculateGatewayFees(totalPaid);

  console.log(`🍽️ [MENU-CHECKOUT] TRANSACTION TOTALS:`);
  console.log(`   Total Paid (before gateway): ${totalPaid}`);
  console.log(`   Total Club Receives: ${totalClubReceives}`);
  console.log(`   Total Platform Receives: ${totalPlatformReceives}`);
  console.log(`   Gateway Fee: ${transactionGatewayFee}`);
  console.log(`   Gateway IVA: ${transactionIVA}`);
  console.log(`   Final Total: ${totalPaid + transactionGatewayFee + transactionIVA}`);
  console.log(`   ========================================`);

  // Create and save the purchase transaction first
  const transaction = transactionRepo.create({
    clubId,
    sessionId: sessionId ?? undefined,
    userId: userId ?? undefined,
    totalPaid: totalPaid + transactionGatewayFee + transactionIVA, // Add gateway fees to total
    clubReceives: totalClubReceives,
    platformReceives: totalPlatformReceives,
    gatewayFee: transactionGatewayFee,
    gatewayIVA: transactionIVA,
    paymentProvider: "mock",
    paymentStatus: "PENDING",
    ...(transactionId ? { paymentProviderTransactionId: transactionId } : {}),
    email,
  });

  await transactionRepo.save(transaction);

  // Now create the individual menu purchases and associate them with the transaction
  // Reset totals for individual menu item creation
  let individualTotalPaid = 0;
  let individualTotalClubReceives = 0;
  let individualTotalPlatformReceives = 0;

  for (const item of cartItems) {
    const club = item.menuItem.club;
    const hasVariants = item.menuItem.hasVariants;

    let basePrice: number;

    if (hasVariants) {
      const variantPrice = Number(item.variant?.price);
      if (isNaN(variantPrice)) {
        console.error(`[❌] Invalid price for menuItemId: ${item.menuItemId}`);
        continue; // skip this item to avoid corrupt totals
      }
      basePrice = variantPrice;
    } else {
      if (typeof item.menuItem.price !== "number") {
        console.error(`[❌] Menu item has no price — MenuItem ID: ${item.menuItem.id}`);
        return res.status(500).json({
          error: `Internal error: Price missing for item "${item.menuItem.name}"`,
        });
      }
      basePrice = item.menuItem.price;
    }

    // 🎯 Apply dynamic pricing if enabled
    let dynamicPrice = basePrice;
    let dynamicPricingReason: string | undefined;
    
    if (hasVariants && item.variant?.dynamicPricingEnabled) {
      // Variant has dynamic pricing enabled
      dynamicPrice = computeDynamicPrice({
        basePrice,
        clubOpenDays: club.openDays,
        openHours: club.openHours, // Pass the array directly, not a string
      });
    } else if (!hasVariants && item.menuItem.dynamicPricingEnabled) {
      // Menu item has dynamic pricing enabled
      dynamicPrice = computeDynamicPrice({
        basePrice,
        clubOpenDays: club.openDays,
        openHours: club.openHours, // Pass the array directly, not a string
      });
    }

    // Determine dynamic pricing reason
    if (dynamicPrice !== basePrice) {
      const now = new Date();
      const openHoursArr = Array.isArray(club.openHours) ? club.openHours : [];
      if (openHoursArr.length > 0) {
        const [openHourNum] = openHoursArr[0].open.split(':').map(Number);
        const [closeHourNum] = openHoursArr[0].close.split(':').map(Number);
        const currentHour = now.getHours();
        if (currentHour < openHourNum || currentHour >= closeHourNum) {
          dynamicPricingReason = "closed_day";
        } else {
          dynamicPricingReason = "early";
        }
      }
    }

    // 🎯 Calculate individual menu item fees (only platform fee)
    const platformFee = calculatePlatformFee(dynamicPrice, getMenuCommissionRate()); // 10% for menu items
    
    const quantity = item.quantity;

    // Add to individual totals for this menu item
    individualTotalPaid += (dynamicPrice + platformFee) * quantity;
    individualTotalClubReceives += dynamicPrice * quantity;
    individualTotalPlatformReceives += platformFee * quantity;

    const purchase = purchaseRepo.create({
      menuItemId: item.menuItemId,
      variantId: item.variantId ?? undefined,
      userId,
      sessionId,
      clubId: item.clubId,
      email,
      date: new Date(),
      quantity,
      // 🎯 Individual menu item pricing information
      originalBasePrice: basePrice,
      priceAtCheckout: dynamicPrice,
      dynamicPricingWasApplied: dynamicPrice !== basePrice,
      dynamicPricingReason,
      clubReceives: dynamicPrice, // What the club gets for this specific menu item
      // 🎯 Individual menu item fees
      platformFee: platformFee,
      platformFeeApplied: getMenuCommissionRate(), // 10% for menu items
      purchaseTransactionId: transaction.id,
    });

    menuPurchases.push(purchase);
  }

  // Save transaction first to get the ID
  await transactionRepo.save(transaction);

  // Now generate QR with the actual MenuPurchaseTransaction.id
  const payload = {
    id: transaction.id,
    clubId,
    type: "menu" as const
  };

  const encryptedPayload = await generateEncryptedQR(payload);
  const qrImageDataUrl = await QRCode.toDataURL(encryptedPayload);

  // Update transaction with the QR payload
  transaction.qrPayload = encryptedPayload;
  await transactionRepo.save(transaction);

  for (const purchase of menuPurchases) {
    purchase.transaction = transaction;
  }

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
    total: transaction.totalPaid, 
  });

  if (userId) {
    await cartRepo.delete({ userId });
  } else if (sessionId) {
    await cartRepo.delete({ sessionId });
  }

  return res.json({
    message: "Menu checkout completed",
    transactionId: transaction.id,
    totalPaid: transaction.totalPaid,
    items: menuPurchases.map((p) => ({
      itemId: p.menuItemId,
      variantId: p.variantId,
      priceAtCheckout: p.priceAtCheckout,
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
  const email = typedReq.user?.email ?? typedReq.body?.email;
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
