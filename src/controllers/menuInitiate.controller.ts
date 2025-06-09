import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuCartItem } from "../entities/MenuCartItem";
import { computeDynamicPrice } from "../utils/dynamicPricing";
import { isDisposableEmail } from "../utils/disposableEmailValidator";
import { processSuccessfulMenuCheckout } from "./menuCheckout.controller";

// 🛒 POST /menu/initiate
export const initiateMenuCheckout = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id ?? null;
    const sessionId = userId ? null : (req as any).sessionID;
    const email = req.body.email;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Valid email is required" });
    }

    if (isDisposableEmail(email)) {
      return res.status(400).json({ error: "Disposable email addresses are not allowed" });
    }

    if (!userId && !sessionId) {
      return res.status(400).json({ error: "Missing session or user" });
    }

    const cartRepo = AppDataSource.getRepository(MenuCartItem);
    const cartItems = await cartRepo.find({
      where: userId ? { userId } : { sessionId },
      relations: ["menuItem", "variant", "menuItem.club"],
    });

    if (!cartItems.length) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    let total = 0;

    for (const item of cartItems) {
      const basePrice = item.variant?.price ?? item.menuItem.price!;
      const dynamicPrice = computeDynamicPrice({
        basePrice,
        clubOpenDays: item.menuItem.club.openDays,
        openHours: item.menuItem.club.openHours,
      });

      item.unitPrice = dynamicPrice;
      total += dynamicPrice * item.quantity;
    }

    if (total <= 0) {
      return res.status(400).json({ error: "Total must be greater than zero" });
    }

    const transactionId = `mock-${Date.now()}`;

    return await processSuccessfulMenuCheckout({
      userId,
      sessionId,
      email,
      req,
      res,
      transactionId,
    });
  } catch (err) {
    console.error("❌ Error initiating menu checkout:", err);
    return res.status(500).json({ error: "Server error during checkout" });
  }
};
