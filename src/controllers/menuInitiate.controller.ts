import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuCartItem } from "../entities/MenuCartItem";
import { isDisposableEmail } from "../utils/disposableEmailValidator";
import { processSuccessfulMenuCheckout } from "./menuCheckout.controller";
import { computeDynamicPrice } from "../utils/dynamicPricing";
import { differenceInMinutes } from "date-fns";
import { AuthenticatedRequest } from "../types/express";

// 🍊 POST /menu/initiate
export const initiateMenuCheckout = async (req: Request, res: Response) => {
  const typedReq = req as AuthenticatedRequest;
  const userId = typedReq.user?.id ?? null;
  const sessionId: string | null = !userId && typedReq.sessionId ? typedReq.sessionId : null;
  const email = typedReq.user?.email ?? typedReq.body?.email;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required to complete checkout." });
  }

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

    const dynamicPrice = computeDynamicPrice({
      basePrice,
      clubOpenDays: club.openDays,
      openHours: club.openHours,
    });

    item.unitPrice = Number(dynamicPrice);
    total += dynamicPrice * item.quantity;
  }

  const reference = `mock-${Date.now()}`;
  console.log(`[INITIATE] Mock menu reference ${reference} | User: ${userId ?? sessionId} | Email: ${email}`);

  return await processSuccessfulMenuCheckout({ userId, sessionId, email, req, res, transactionId: reference });
};
