import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/CartItem";
import { calculatePlatformFee, calculateGatewayFees } from "../utils/feeUtils";
import { v4 as uuidv4 } from "uuid";

export const initiateMockCheckout = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id ?? null;
  const sessionId = req.cookies?.sessionId ?? null;

  const cartRepo = AppDataSource.getRepository(CartItem);

  const where =
    userId !== null ? { userId } : sessionId !== null ? { sessionId } : undefined;

  if (!where) {
    return res.status(400).json({ error: "Missing session or user" });
  }

  const cartItems = await cartRepo.find({
    where,
    relations: ["ticket"],
  });

  if (!cartItems.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  let total = 0;

  for (const item of cartItems) {
    const price = Number(item.ticket.price);
    const platformFee = calculatePlatformFee(price, 0.05);
    const { totalGatewayFee, iva } = calculateGatewayFees(price);
    const finalPerUnit = price + platformFee + totalGatewayFee + iva;
    total += finalPerUnit * item.quantity;
  }

  const reference = `mock_txn_${uuidv4()}`;

  return res.json({
    amountInCents: Math.round(total * 100),
    currency: "COP",
    reference,
    checkoutUrl: `https://mock.nightlife.com/pay?ref=${reference}`,
  });
};
