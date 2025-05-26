import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/CartItem";
import { Ticket } from "../entities/Ticket";
import { TicketPurchase } from "../entities/TicketPurchase";
import { PurchaseTransaction } from "../entities/PurchaseTransaction";
import { calculatePlatformFee, calculateGatewayFees } from "../utils/feeUtils";
import { isDisposableEmail } from "../utils/disposableEmailValidator";
import { generateEncryptedQR } from "../utils/generateEncryptedQR";
import { sendTicketEmail } from "../services/emailService";

export const checkout = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id ?? null;
  const sessionId = req.cookies?.sessionId ?? null;
  let email: string | undefined = (req as any).user?.email ?? req.body?.email;

  if (!email) {
    return res.status(400).json({ error: "Email is required for checkout" });
  }

  // ❌ Block anonymous users with disposable emails
  if (!req.user && isDisposableEmail(email)) {
    return res.status(403).json({ error: "Disposable email domains are not allowed" });
  }

  const cartRepo = AppDataSource.getRepository(CartItem);
  const ticketRepo = AppDataSource.getRepository(Ticket);
  const purchaseRepo = AppDataSource.getRepository(TicketPurchase);
  const transactionRepo = AppDataSource.getRepository(PurchaseTransaction);

  const cartItems = await cartRepo.find({
    where: userId ? { userId } : { sessionId },
    relations: ["ticket"],
  });

  if (!cartItems.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const clubId = cartItems[0].ticket.clubId;
  const date = new Date(cartItems[0].date);

  let totalPaid = 0;
  let totalClubReceives = 0;
  let totalPlatformReceives = 0;
  let totalGatewayFee = 0;
  let totalGatewayIVA = 0;

  const platformFeePercentage = 0.05;

  let retentionICA: number | undefined;
  let retentionIVA: number | undefined;
  let retentionFuente: number | undefined;

  const ticketPurchases: TicketPurchase[] = [];

  for (const item of cartItems) {
    const ticket = item.ticket;
    const quantity = item.quantity;

    for (let i = 0; i < quantity; i++) {
      const basePrice = Number(ticket.price);
      const platformFee = calculatePlatformFee(basePrice, platformFeePercentage);
      const { totalGatewayFee: itemGatewayFee, iva } = calculateGatewayFees(basePrice);

      const userPaid = basePrice + platformFee + itemGatewayFee + iva;
      const clubReceives = basePrice;

      totalPaid += userPaid;
      totalClubReceives += clubReceives;
      totalPlatformReceives += platformFee;
      totalGatewayFee += itemGatewayFee;
      totalGatewayIVA += iva;

      // ✅ Encrypt the QR payload
      const payload = { ticketId: ticket.id, date: date.toISOString().split("T")[0], email };
      const qrDataUrl = await generateEncryptedQR(payload);

      const purchase = purchaseRepo.create({
        ticketId: ticket.id,
        userId,
        clubId,
        email,
        date,
        userPaid,
        clubReceives,
        platformReceives: platformFee,
        gatewayFee: itemGatewayFee,
        gatewayIVA: iva,
        qrCodeEncrypted: Buffer.from(JSON.stringify(payload)).toString("base64"), // still stored securely
        platformFeeApplied: platformFeePercentage,
      });

      ticketPurchases.push(purchase);

      // ✅ Send email with embedded QR
      await sendTicketEmail({
        email,
        ticketName: ticket.name,
        date: date.toISOString().split("T")[0],
        qrDataUrl,
      });
    }
  }

  const transactionData: Partial<PurchaseTransaction> = {
    email,
    clubId,
    date,
    totalPaid,
    clubReceives: totalClubReceives,
    platformReceives: totalPlatformReceives,
    gatewayFee: totalGatewayFee,
    gatewayIVA: totalGatewayIVA,
    retentionICA,
    retentionIVA,
    retentionFuente,
    ...(userId ? { userId } : {}),
  };

  const transaction = transactionRepo.create(transactionData);
  await transactionRepo.save(transaction);

  for (const purchase of ticketPurchases) {
    purchase.transaction = transaction;
  }

  await purchaseRepo.save(ticketPurchases);
  await cartRepo.delete(userId ? { userId } : { sessionId });

  return res.json({
    message: "Checkout completed",
    transactionId: transaction.id,
    totalPaid,
    tickets: ticketPurchases.map((p) => ({
      id: p.id,
      ticket: p.ticket,
      userPaid: p.userPaid,
    })),
  });
};
