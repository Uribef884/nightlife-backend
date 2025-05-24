import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { AuthenticatedRequest } from "../types/express";
import { CartItem } from "../entities/CartItem";
import { TicketPurchase } from "../entities/TicketPurchase";
import { Ticket } from "../entities/Ticket";
import { v4 as uuidv4 } from "uuid";
import { PurchaseTransaction } from "../entities/PurchaseTransaction";

function generateEncryptedQR(): string {
  return "encrypted:" + uuidv4(); // placeholder for real encryption
}

export const checkout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const sessionId = !userId ? (req as any).sessionId : undefined;
    const email = req.user?.email || req.body.email;

    if (!userId && !sessionId) {
      res.status(400).json({ error: "User or session ID required" });
      return;
    }

    if (!email) {
      res.status(400).json({ error: "Email is required to complete checkout" });
      return;
    }

    const cartRepo = AppDataSource.getRepository(CartItem);
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const purchaseRepo = AppDataSource.getRepository(TicketPurchase);
    const transactionRepo = AppDataSource.getRepository(PurchaseTransaction);

    const cartItems = await cartRepo.find({
      where: userId ? { userId } : { sessionId },
      relations: ["ticket", "ticket.club"],
    });

    if (cartItems.length === 0) {
      res.status(400).json({ error: "Cart is empty" });
      return;
    }

    // 🧮 Global aggregates for this transaction
    let totalPaid = 0;
    let clubReceives = 0;
    let platformReceives = 0;
    let gatewayFee = 0;
    let gatewayIVA = 0;

    const firstClubId = cartItems[0].ticket.club.id;
    const today = new Date().toISOString().split("T")[0];
    const purchasesToCreate: TicketPurchase[] = [];

    for (const item of cartItems) {
      const { ticket, quantity, date } = item;

      const latestTicket = await ticketRepo.findOne({
        where: { id: ticket.id },
        relations: ["club"],
      });

      if (!latestTicket || !latestTicket.isActive) {
        res.status(400).json({ error: `Ticket '${ticket.name}' is no longer available` });
        return;
      }

      const platformFeeRate = 0.05;
      const gatewayRate = 0.0299;
      const fixedFee = 900;
      const ivaRate = 0.19;

      const platformFee = Math.round(latestTicket.price * platformFeeRate);
      const gatewayRaw = Math.round(latestTicket.price * gatewayRate + fixedFee);
      const gatewayIva = Math.round(gatewayRaw * ivaRate);
      const clubNet = latestTicket.price - platformFee;

      for (let i = 0; i < quantity; i++) {
        totalPaid += latestTicket.price;
        platformReceives += platformFee;
        gatewayFee += gatewayRaw;
        gatewayIVA += gatewayIva;
        clubReceives += clubNet;

        purchasesToCreate.push(
          purchaseRepo.create({
            ticket,
            ticketId: latestTicket.id,
            clubId: latestTicket.club.id,
            date,
            email,
            qrCodeEncrypted: generateEncryptedQR(),
            ...(userId ? { userId } : {}),
            userPaid: latestTicket.price,
            clubReceives: clubNet,
            platformReceives: platformFee,
            gatewayFee: gatewayRaw,
            gatewayIVA: gatewayIva,
            platformFeeApplied: platformFee,
            purchaseTransactionId: "", // to be set after creating the transaction
          })
        );
      }
    }

    // ✨ Create and assign the transaction
    const transaction = transactionRepo.create({
      userId,
      clubId: firstClubId,
      email,
      date: today,
      totalPaid,
      clubReceives,
      platformReceives,
      gatewayFee,
      gatewayIVA,
    });

    const savedTx = await transactionRepo.save(transaction);

    for (const p of purchasesToCreate) {
      p.purchaseTransactionId = savedTx.id;
    }

    await purchaseRepo.save(purchasesToCreate);
    await cartRepo.delete(userId ? { userId } : { sessionId });

    const summary = purchasesToCreate.reduce<Record<string, any>>((acc, p) => {
      const key = `${p.ticketId}-${p.date}`;
      if (!acc[key]) {
        acc[key] = {
          ticketId: p.ticketId,
          ticketName: p.ticket.name,
          date: p.date,
          quantity: 0,
          qrCodes: [],
        };
      }
      acc[key].quantity += 1;
      acc[key].qrCodes.push(p.qrCodeEncrypted);
      return acc;
    }, {});

    res.status(201).json({
      message: "Checkout successful",
      transactionId: savedTx.id,
      summary: Object.values(summary),
    });
  } catch (err) {
    console.error("❌ Error during checkout:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
