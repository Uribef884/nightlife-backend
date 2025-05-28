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
import { mockValidateWompiTransaction } from "../services/mockWompiService";

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

  const where = userId !== null ? { userId } : sessionId !== null ? { sessionId } : undefined;
  if (!where) return res.status(400).json({ error: "Missing session or user" });

  const cartItems = await cartRepo.find({
    where,
    relations: ["ticket", "ticket.club"],
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
  const emailTasks: Promise<void>[] = [];

  for (const item of cartItems) {
    const ticket = item.ticket;
    const quantity = item.quantity;

    // ✅ If quantity is set → reduce stock
    if (ticket.quantity != null) {
      const updatedTicket = await ticketRepo.findOneByOrFail({ id: ticket.id });

      if (updatedTicket.quantity! < quantity) {
        return res.status(400).json({ error: `Not enough tickets left for ${ticket.name}` });
      }

      updatedTicket.quantity! -= quantity;
      await ticketRepo.save(updatedTicket);
    }

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

      const payload = {
        ticketId: ticket.id,
        date: date.toISOString().split("T")[0],
        email,
      };

      const qrDataUrl = await generateEncryptedQR(payload);

      const purchase = purchaseRepo.create({
        ticketId: ticket.id as string,
        userId: userId ?? undefined,
        clubId,
        email,
        date,
        userPaid,
        clubReceives,
        platformReceives: platformFee,
        gatewayFee: itemGatewayFee,
        gatewayIVA: iva,
        qrCodeEncrypted: Buffer.from(JSON.stringify(payload)).toString("base64"),
        platformFeeApplied: platformFeePercentage,
      });

      ticketPurchases.push(purchase);

      emailTasks.push(
        sendTicketEmail({
          to: email,
          ticketName: ticket.name,
          date: payload.date,
          qrImageDataUrl: qrDataUrl,
          clubName: ticket.club?.name || "Your Club",
        }).catch(async (err) => {
          console.warn(`[EMAIL ❌] Failed to send ticket ${i + 1}, retrying...`);
          try {
            await sendTicketEmail({
              to: email,
              ticketName: ticket.name,
              date: payload.date,
              qrImageDataUrl: qrDataUrl,
              clubName: ticket.club?.name || "Your Club",
            });
          } catch (retryErr) {
            console.error(`[EMAIL ❌] Retry failed for ticket ${i + 1}:`, retryErr);
          }
        })
      );
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
    ...(transactionId
      ? {
          paymentProviderTransactionId: transactionId,
          paymentProvider: "mock",
          paymentStatus: "APPROVED",
        }
      : {}),
  };

  const transaction = transactionRepo.create(transactionData);
  await transactionRepo.save(transaction);

  for (const purchase of ticketPurchases) {
    purchase.transaction = transaction;
  }

  await purchaseRepo.save(ticketPurchases);

  // 🧹 Clear cart
  if (userId) {
    await cartRepo.delete({ userId });
  } else if (sessionId) {
    await cartRepo.delete({ sessionId });
  }

  await Promise.all(emailTasks);

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
  const userId = (req as any).user?.id ?? null;
  const sessionId = req.cookies?.sessionId ?? null;
  const email: string | undefined = (req as any).user?.email ?? req.body?.email;

  if (!email) {
    return res.status(400).json({ error: "Email is required for checkout" });
  }

  if (!req.user && isDisposableEmail(email)) {
    return res.status(403).json({ error: "Disposable email domains are not allowed" });
  }

  return await processSuccessfulCheckout({ userId, sessionId, email, req, res });
};

export const confirmMockCheckout = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id ?? null;
  const sessionId = req.cookies?.sessionId ?? null;
  const email: string | undefined = (req as any).user?.email ?? req.body?.email;
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
