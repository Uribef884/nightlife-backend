import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuCartItem } from "../entities/MenuCartItem";
import { isDisposableEmail } from "../utils/disposableEmailValidator";
import { processSuccessfulMenuCheckout } from "./menuCheckout.controller";
import { computeDynamicPrice } from "../utils/dynamicPricing";
import { differenceInMinutes } from "date-fns";
import { AuthenticatedRequest } from "../types/express";
import { issueMockTransaction } from "../services/mockWompiService";
import { sanitizeInput } from "../utils/sanitizeInput";
import { calculatePlatformFee, calculateGatewayFees } from "../utils/menuFeeUtils";
import { getMenuCommissionRate } from "../config/fees";

// 🍊 POST /menu/initiate
export const initiateMenuCheckout = async (req: Request, res: Response) => {
  const typedReq = req as AuthenticatedRequest;
  const userId = typedReq.user?.id ?? null;
  const sessionId: string | null = !userId && typedReq.sessionId ? typedReq.sessionId : null;
  
  // Sanitize email input
  const rawEmail = typedReq.user?.email ?? typedReq.body?.email;
  const sanitizedEmail = sanitizeInput(rawEmail);
  
  if (!sanitizedEmail) {
    return res.status(400).json({ error: "Valid email is required to complete checkout." });
  }
  
  const email = sanitizedEmail;

  if (!req.user && isDisposableEmail(email)) {
    return res.status(403).json({ error: "Disposable email domains are not allowed." });
  }

  const cartRepo = AppDataSource.getRepository(MenuCartItem);
  const where = userId !== null ? { userId } : sessionId !== null ? { sessionId } : undefined;

  if (!where) {
    return res.status(400).json({ error: "Missing session or user" });
  }

  const cartItems = await cartRepo.find({
    where,
    relations: ["menuItem", "variant", "menuItem.club"],
  });

  if (!cartItems.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  // 🍒 TTL expiration check
  const oldestItem = cartItems.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
  const minutesOld = differenceInMinutes(new Date(), new Date(oldestItem.createdAt));
  if (minutesOld > 30) {
    await cartRepo.delete(where);
    return res.status(400).json({ error: "Cart expired. Please start over." });
  }

  const invalidItem = cartItems.find((item) => !item.menuItem.isActive);
  if (invalidItem) {
    return res.status(400).json({
      error: `The menu item "${invalidItem.menuItem.name}" is no longer available for purchase.`,
    });
  }

  let total = 0;
  let totalPaid = 0;
  let totalClubReceives = 0;
  let totalPlatformReceives = 0;

  for (const item of cartItems) {
    const club = item.menuItem.club;
    const hasVariants = item.menuItem.hasVariants;

    let basePrice: number;

    if (hasVariants) {
      const variantPrice = Number(item.variant?.price);
      if (isNaN(variantPrice)) {
        console.error(`[❌] Variant has no valid price — Variant ID: ${item.variant?.id}, MenuItem ID: ${item.menuItem.id}`);
        console.dir(item.variant, { depth: null });
        return res.status(500).json({
          error: `Internal error: Variant for "${item.menuItem.name}" has no valid price.`,
        });
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

    // Compute dynamic price based on whether it's enabled
    let dynamicPrice = basePrice;
    
    if (hasVariants && item.variant) {
      // For variants, check variant's dynamic pricing setting
      if (item.variant.dynamicPricingEnabled) {
        dynamicPrice = computeDynamicPrice({
          basePrice,
          clubOpenDays: club.openDays,
          openHours: club.openHours, // Pass the array directly, not a string
        });
      }
    } else {
      // For regular menu items, check menu item's dynamic pricing setting
      if (item.menuItem.dynamicPricingEnabled) {
        dynamicPrice = computeDynamicPrice({
          basePrice,
          clubOpenDays: club.openDays,
          openHours: club.openHours, // Pass the array directly, not a string
        });
      }
    }
    
    // Calculate platform fees per item (matching checkout logic exactly)
    const platformFee = calculatePlatformFee(dynamicPrice, getMenuCommissionRate());
    const quantity = item.quantity;
    
    // Add to transaction totals (matching checkout logic exactly)
    total += dynamicPrice * quantity;
    totalPaid += (dynamicPrice + platformFee) * quantity;
    totalClubReceives += dynamicPrice * quantity;
    totalPlatformReceives += platformFee * quantity;
  }

  // Calculate gateway fees on the total amount (matching checkout logic exactly)
  const { totalGatewayFee, iva } = calculateGatewayFees(totalPaid);
  const finalTotal = totalPaid + totalGatewayFee + iva;

  console.log(`🍽️ [MENU-INITIATE] CALCULATION DEBUG:`);
  console.log(`   Total Paid (before gateway): ${totalPaid}`);
  console.log(`   Total Club Receives: ${totalClubReceives}`);
  console.log(`   Total Platform Receives: ${totalPlatformReceives}`);
  console.log(`   Gateway Fee: ${totalGatewayFee}`);
  console.log(`   Gateway IVA: ${iva}`);
  console.log(`   Final Total: ${finalTotal}`);
  console.log(`   ========================================`);

  const reference = issueMockTransaction();

  // Return the mock transaction reference for the frontend to confirm
  return res.json({
    success: true,
    transactionId: reference,
    total: finalTotal,
    message: "Menu checkout initiated successfully"
  });
};