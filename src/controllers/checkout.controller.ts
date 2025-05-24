import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { AuthenticatedRequest } from "../types/express";
import { CartItem } from "../entities/CartItem";
import { TicketPurchase } from "../entities/TicketPurchase";
import { Ticket } from "../entities/Ticket";
import { v4 as uuidv4 } from "uuid";

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

    const cartItems = await cartRepo.find({
      where: userId ? { userId } : { sessionId },
      relations: ["ticket", "ticket.club"],
    });

    if (cartItems.length === 0) {
      res.status(400).json({ error: "Cart is empty" });
      return;
    }

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

      if (Array.isArray(latestTicket.availableDates) && latestTicket.availableDates.length > 0) {
        const allowedDates = latestTicket.availableDates.map(d =>
          new Date(d).toISOString().split("T")[0]
        );
        if (!allowedDates.includes(date)) {
          res.status(400).json({ error: `Date ${date} not allowed for this ticket` });
          return;
        }
      } else {
        const day = new Date(`${date}T12:00:00`).toLocaleString("en-US", { weekday: "long" });
        if (!latestTicket.club.openDays.includes(day)) {
          res.status(400).json({ error: `${latestTicket.club.name} is not open on ${day}` });
          return;
        }
      }

      const platformFeeRate = 0.05;
      const gatewayRate = 0.0299;
      const fixedFee = 900;
      const ivaRate = 0.19;

      const platformFee = Math.round(latestTicket.price * platformFeeRate);
      const gatewayFee = Math.round(latestTicket.price * gatewayRate + fixedFee);
      const gatewayIVA = Math.round(gatewayFee * ivaRate);

      const clubReceives = latestTicket.price - platformFee;
      const userPaid = latestTicket.price;

      for (let i = 0; i < quantity; i++) {
        const purchase = purchaseRepo.create({
          ticket,
          ticketId: latestTicket.id,
          clubId: latestTicket.club.id,
          date,
          email,
          qrCodeEncrypted: generateEncryptedQR(),
          ...(userId ? { userId } : {}),
          userPaid,
          clubReceives,
          platformReceives: platformFee,
          gatewayFee,
          gatewayIVA,
          platformFeeApplied: platformFee,
        });
        purchasesToCreate.push(purchase);
      }
    }

    const savedPurchases = await purchaseRepo.save(purchasesToCreate);
    await cartRepo.delete(userId ? { userId } : { sessionId });

    const grouped = savedPurchases.reduce<Record<string, any>>((acc, p) => {
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

    const summary = Object.values(grouped);

    res.status(201).json({
      message: "Checkout successful",
      summary,
    });
  } catch (err) {
    console.error("❌ Error during checkout:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
