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

    if (!userId && !sessionId) {
      res.status(400).json({ error: "User or session ID required" });
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

      // Ensure ticket still exists and is active
      const latestTicket = await ticketRepo.findOne({
        where: { id: ticket.id },
        relations: ["club"],
      });

      if (!latestTicket || !latestTicket.isActive) {
        res.status(400).json({ error: `Ticket '${ticket.name}' is no longer available` });
        return;
      }

      // Validate date again
      if (latestTicket.availableDates && latestTicket.availableDates.length > 0) {
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

      const count = latestTicket.maxPerPerson === 1 ? 1 : quantity;

      for (let i = 0; i < count; i++) {
        const purchase = purchaseRepo.create({
          ticket,
          ticketId: latestTicket.id,
          clubId: latestTicket.club.id,
          date,
          qrCodeEncrypted: generateEncryptedQR(),
          ...(userId ? { userId } : {}),
        });
        purchasesToCreate.push(purchase);
      }
    }

    const savedPurchases = await purchaseRepo.save(purchasesToCreate);
    await cartRepo.delete(userId ? { userId } : { sessionId });

    res.status(201).json({
      message: "Checkout successful",
      purchases: savedPurchases.map(p => ({
        id: p.id,
        ticketName: p.ticket.name,
        date: p.date,
        qrCode: p.qrCodeEncrypted,
      })),
    });
  } catch (err) {
    console.error("❌ Error during checkout:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
