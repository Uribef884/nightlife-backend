import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/CartItem";
import { calculatePlatformFee, calculateGatewayFees } from "../utils/feeUtils";
import { isDisposableEmail } from "../utils/disposableEmailValidator";
import { processSuccessfulCheckout } from "./checkout.controller";
import { issueMockTransaction, mockValidateWompiTransaction } from "../services/mockWompiService";
import { differenceInMinutes } from "date-fns"; // 🆕 For TTL logic

export const initiateMockCheckout = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id ?? null;
  const sessionId = req.cookies?.sessionId ?? null;
  const email = (req as any).user?.email ?? req.body?.email;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required to complete checkout." });
  }

  if (!req.user && isDisposableEmail(email)) {
    return res.status(403).json({ error: "Disposable email domains are not allowed." });
  }

  const cartRepo = AppDataSource.getRepository(CartItem);
  const where = userId !== null ? { userId } : sessionId !== null ? { sessionId } : undefined;

  if (!where) {
    return res.status(400).json({ error: "Missing session or user" });
  }

  const cartItems = await cartRepo.find({
    where,
    relations: ["ticket", "ticket.club"],
  });

  if (!cartItems.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  // 🕒 TTL expiration check
  const oldestItem = cartItems.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
  const minutesOld = differenceInMinutes(new Date(), new Date(oldestItem.createdAt));
  if (minutesOld > 30) {
    await cartRepo.delete(where);
    return res.status(400).json({ error: "Cart expired. Please start over." });
  }

  const invalidTicket = cartItems.find((item) => !item.ticket.isActive);
  if (invalidTicket) {
    return res.status(400).json({
      error: `The ticket "${invalidTicket.ticket.name}" is no longer available for purchase.`,
    });
  }

  const allPricesAreValidNumbers = cartItems.every(
    (item) => !isNaN(Number(item.ticket.price))
  );

  if (!allPricesAreValidNumbers) {
    return res.status(400).json({ error: "Cart contains invalid ticket price types" });
  }

  const isFreeCheckout = cartItems.every((item) => Number(item.ticket.price) === 0);

  if (isFreeCheckout) {
    console.log("[INITIATE] Free checkout. Processing immediately.");
    return await processSuccessfulCheckout({ userId, sessionId, email, req, res });
  }

  let total = 0;
  for (const item of cartItems) {
    const price = Number(item.ticket.price);
    const platformFee = calculatePlatformFee(price, 0.05);
    const { totalGatewayFee, iva } = calculateGatewayFees(price);
    const finalPerUnit = price + platformFee + totalGatewayFee + iva;
    total += finalPerUnit * item.quantity;
  }

  const reference = issueMockTransaction();
  console.log(`[INITIATE] Issued mock reference ${reference}. Confirming checkout...`);

  const mockResult = await mockValidateWompiTransaction(reference);
  if (!mockResult.approved) {
    return res.status(400).json({ error: "Mock transaction failed" });
  }

  return await processSuccessfulCheckout({ userId, sessionId, email, req, res, transactionId: reference });
};
