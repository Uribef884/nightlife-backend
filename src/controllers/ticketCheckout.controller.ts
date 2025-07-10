import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/TicketCartItem";
import { Ticket } from "../entities/Ticket";
import { TicketPurchase } from "../entities/TicketPurchase";
import { PurchaseTransaction } from "../entities/TicketPurchaseTransaction";
import { calculatePlatformFee, calculateGatewayFees } from "../utils/ticketfeeUtils";
import { isDisposableEmail } from "../utils/disposableEmailValidator";
import { generateEncryptedQR } from "../utils/generateEncryptedQR";
import { sendTicketEmail } from "../services/emailService";
import { differenceInMinutes } from "date-fns";
import { mockValidateWompiTransaction } from "../services/mockWompiService";
import { User } from "../entities/User";
import { AuthenticatedRequest } from "../types/express"; 
import QRCode from "qrcode";

export const processSuccessfulCheckout = async ({
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
  const cartRepo = AppDataSource.getRepository(CartItem);
  const ticketRepo = AppDataSource.getRepository(Ticket);
  const purchaseRepo = AppDataSource.getRepository(TicketPurchase);
  const transactionRepo = AppDataSource.getRepository(PurchaseTransaction);
  const userRepo = AppDataSource.getRepository(User);

  const where = userId !== null ? { userId } : sessionId !== null ? { sessionId } : undefined;
  if (!where) return res.status(400).json({ error: "Missing session or user" });

  const cartItems = await cartRepo.find({
    where,
    relations: ["ticket", "ticket.club"],
  });

  if (!cartItems.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const oldest = cartItems.reduce((a, b) => a.createdAt < b.createdAt ? a : b);
  const age = differenceInMinutes(new Date(), new Date(oldest.createdAt));
  if (age > 30) {
    await cartRepo.delete(where);
    return res.status(400).json({ error: "Cart expired. Please start over." });
  }

  for (const item of cartItems) {
    if (!item.ticket.isActive) {
      return res.status(400).json({
        error: `The ticket "${item.ticket.name}" is no longer available for purchase.`,
      });
    }
  }

  const isFreeCheckout = cartItems.every(item => Number(item.ticket.price) === 0);
  if (isFreeCheckout && transactionId) {
    return res.status(400).json({ error: "Free checkouts should not include a payment transaction" });
  }
  if (!isFreeCheckout && !transactionId) {
    return res.status(400).json({ error: "Missing transaction ID for paid checkout" });
  }

  const clubId = cartItems[0].ticket.clubId;
  const rawDateStr = cartItems[0].date instanceof Date
    ? cartItems[0].date.toISOString().split("T")[0]
    : String(cartItems[0].date);
  const todayStr = new Date().toISOString().split("T")[0];
  if (rawDateStr < todayStr) {
    return res.status(400).json({ error: "Cannot select a past date" });
  }

  const [year, month, day] = rawDateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  const platformFeePercentage = 0.05;
  let retentionICA: number | undefined;
  let retentionIVA: number | undefined;
  let retentionFuente: number | undefined;

  let totalPaid = 0;
  let totalClubReceives = 0;
  let totalPlatformReceives = 0;
  let totalGatewayFee = 0;
  let totalGatewayIVA = 0;

  const ticketPurchases: TicketPurchase[] = [];
  const user = userId ? await userRepo.findOneBy({ id: userId }) : undefined;

  for (const item of cartItems) {
    const ticket = item.ticket;
    const quantity = item.quantity;

    if (ticket.quantity != null) {
      const updatedTicket = await ticketRepo.findOneByOrFail({ id: ticket.id });
      if ((updatedTicket.quantity ?? 0) < quantity) {
        return res.status(400).json({ error: `Not enough tickets left for ${ticket.name}` });
      }
      updatedTicket.quantity = (updatedTicket.quantity ?? 0) - quantity;
      await ticketRepo.save(updatedTicket);
    }

    for (let i = 0; i < quantity; i++) {
      const basePrice = Number(ticket.price);
      const platformFee = isFreeCheckout ? 0 : calculatePlatformFee(basePrice, platformFeePercentage);
      const { totalGatewayFee: itemGatewayFee, iva } = isFreeCheckout
        ? { totalGatewayFee: 0, iva: 0 }
        : calculateGatewayFees(basePrice);

      const userPaid = basePrice + platformFee + itemGatewayFee + iva;
      const clubReceives = basePrice;

      totalPaid += userPaid;
      totalClubReceives += clubReceives;
      totalPlatformReceives += platformFee;
      totalGatewayFee += itemGatewayFee;
      totalGatewayIVA += iva;

      const type = "ticket" as const;
      const payload = {
        type: type, // ✅ REQUIRED field
        ticketId: ticket.id,
        date: rawDateStr,
        email,
      };

      const encryptedPayload = await generateEncryptedQR(payload);             // ⬅️ payload only
      const qrDataUrl = await QRCode.toDataURL(encryptedPayload);       // ⬅️ image for email

      const purchase = purchaseRepo.create({
        ticketId: ticket.id,
        userId,
        sessionId,
        clubId,
        email,
        date,
        userPaid,
        clubReceives,
        platformReceives: platformFee,
        gatewayFee: itemGatewayFee,
        gatewayIVA: iva,
        qrCodeEncrypted: encryptedPayload,
        platformFeeApplied: platformFeePercentage,
      });

      ticketPurchases.push(purchase);

      try {
        await sendTicketEmail({
          to: email,
          ticketName: ticket.name,
          date: rawDateStr,
          qrImageDataUrl: qrDataUrl,
          clubName: ticket.club?.name || "Your Club",
          index: i,
          total: quantity,
        });
      } catch (err) {
        console.error(`[EMAIL ❌] Ticket ${i + 1} failed:`, err);
      }
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
    ...(user ? { user } : {}),
    ...(isFreeCheckout
      ? {
          paymentProvider: "free",
          paymentStatus: "APPROVED", 
        }
      : {
          paymentProviderTransactionId: transactionId!,
          paymentProvider: "mock",
          paymentStatus: "PENDING", 
        }),
  };

  const transaction = transactionRepo.create(transactionData);
  await transactionRepo.save(transaction);

  for (const purchase of ticketPurchases) {
    purchase.transaction = transaction;
  }

  await purchaseRepo.save(ticketPurchases);

  if (userId) {
    await cartRepo.delete({ userId });
  } else if (sessionId) {
    await cartRepo.delete({ sessionId });
  }

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

export const checkout = async (req: Request, res: Response) => {
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

  return await processSuccessfulCheckout({ userId, sessionId, email, req, res });
};

export const confirmMockCheckout = async (req: Request, res: Response) => {
  const typedReq = req as AuthenticatedRequest;
  const userId = typedReq.user?.id ?? null;
  const sessionId = !userId && typedReq.sessionId ? typedReq.sessionId : null;
  const email: string | undefined = typedReq.user?.email ?? typedReq.body?.email;
  const transactionId = req.body.transactionId;

  if (!email || !transactionId) {
    return res.status(400).json({ error: "Missing email or transaction ID" });
  }

  const wompiResponse = await mockValidateWompiTransaction(transactionId);
  if (!wompiResponse.approved) {
    return res.status(400).json({ error: "Mock transaction not approved" });
  }

  return await processSuccessfulCheckout({
    userId,
    sessionId,
    email,
    req,
    res,
    transactionId,
  });
};
