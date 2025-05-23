import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/CartItem";
import { AuthenticatedRequest } from "../types/express";
import { Ticket } from "../entities/Ticket";

function ownsCartItem(item: CartItem, userId?: string, sessionId?: string): boolean {
  if (userId) return item.userId === userId;
  return item.sessionId === sessionId;
}

export const addToCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { ticketId, date, quantity } = req.body;
    const userId = req.user?.id;
    const sessionId = !userId ? (req as any).sessionId : undefined;

    if (!ticketId || !date || quantity == null) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    if (typeof quantity !== "number" || quantity <= 0) {
      res.status(400).json({ error: "Quantity must be a positive number" });
      return;
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    if (date < todayStr) {
      res.status(400).json({ error: "Cannot select a past date" });
      return;
    }

    const ticketRepo = AppDataSource.getRepository(Ticket);
    const cartRepo = AppDataSource.getRepository(CartItem);

    const ticket = await ticketRepo.findOne({ where: { id: ticketId }, relations: ["club"] });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    // ✅ Only enforce 3-week rule if no availableDates
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 21);
    const maxStr = `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, "0")}-${String(maxDate.getDate()).padStart(2, "0")}`;

    if ((!ticket.availableDates || ticket.availableDates.length === 0) && date > maxStr) {
      res.status(400).json({ error: "You can only select dates within 3 weeks" });
      return;
    }

    // ✅ Validate availableDates or fallback to club openDays
    const clubOpenDays = ticket.club.openDays || [];
    if (ticket.availableDates && ticket.availableDates.length > 0) {
      const normalizedAvailableDates = ticket.availableDates.map(d =>
        new Date(d).toISOString().split("T")[0]
      );
      if (!normalizedAvailableDates.includes(date)) {
        res.status(400).json({ error: "This ticket is not available on the selected date" });
        return;
      }
    } else {
      const selectedDay = new Date(`${date}T12:00:00`).toLocaleString("en-US", { weekday: "long" });
      if (!clubOpenDays.includes(selectedDay)) {
        res.status(400).json({ error: `This club is not open on ${selectedDay}` });
        return;
      }
    }

    const whereClause = userId ? { userId } : { sessionId };

    const existingItems = await cartRepo.find({
      where: whereClause,
      relations: ["ticket", "ticket.club"],
    });

    let totalTicketsInCart = 0;
    for (const item of existingItems) {
      if (item.ticket.id === ticketId && item.date === date) {
        totalTicketsInCart += item.quantity;
      }
    }

    if (totalTicketsInCart + quantity > ticket.maxPerPerson) {
      res.status(400).json({
        error: `You can only buy up to ${ticket.maxPerPerson} tickets of this type`,
      });
      return;
    }

    if (existingItems.length > 0) {
      const { ticket: existingTicket, date: existingDate } = existingItems[0];
      if (ticket.club.id !== existingTicket.club.id) {
        res.status(400).json({ error: "All tickets in cart must be from the same nightclub" });
        return;
      }
      if (date !== existingDate) {
        res.status(400).json({ error: "All tickets in cart must be for the same date" });
        return;
      }
    }

    const existing = await cartRepo.findOne({
      where: userId
        ? { userId, ticketId, date }
        : { sessionId, ticketId, date },
    });

    if (existing) {
      existing.quantity += quantity;
      await cartRepo.save(existing);
      res.status(200).json(existing);
      return;
    }

    // 🔒 FINAL CHECK: enforce ownership
    if (!userId && !sessionId) {
      res.status(400).json({ error: "Could not determine cart ownership" });
      return;
    }

    const newItem = cartRepo.create({
      ticketId,
      ticket,
      date,
      quantity,
      ...(userId ? { userId } : { sessionId }),
    });

    await cartRepo.save(newItem);
    res.status(201).json(newItem);
  } catch (err) {
    console.error("❌ Error adding to cart:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateCartItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id, quantity } = req.body;
    const userId = req.user?.id;
    const sessionId = !userId ? (req as any).sessionId : undefined;

    if (!id || typeof quantity !== "number" || quantity <= 0) {
      res.status(400).json({ error: "Valid ID and quantity are required" });
      return;
    }

    const cartRepo = AppDataSource.getRepository(CartItem);
    const item = await cartRepo.findOne({
      where: { id },
      relations: ["ticket", "ticket.club"],
    });

    if (!item) {
      res.status(404).json({ error: "Cart item not found" });
      return;
    }

    const ownsItem = (userId && item.userId === userId) || (sessionId && item.sessionId === sessionId);
    if (!ownsItem) {
      res.status(403).json({ error: "You cannot update another user's cart item" });
      return;
    }

    const ticket = item.ticket;
    if (!ticket) {
      res.status(404).json({ error: "Associated ticket not found" });
      return;
    }

    if (quantity > ticket.maxPerPerson) {
      res.status(400).json({ error: `You can only buy up to ${ticket.maxPerPerson} tickets` });
      return;
    }

    item.quantity = quantity;
    await cartRepo.save(item);

    res.status(200).json(item);
  } catch (err) {
    console.error("❌ Error updating cart item:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const removeCartItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const sessionId = !userId ? (req as any).sessionId : undefined;

    const cartRepo = AppDataSource.getRepository(CartItem);
    const item = await cartRepo.findOneBy({ id });

    if (!item) {
      res.status(404).json({ error: "Cart item not found" });
      return;
    }

    if (!ownsCartItem(item, userId, sessionId)) {
      res.status(403).json({ error: "You cannot delete another user's cart item" });
      return;
    }

    await cartRepo.remove(item);
    res.status(204).send();
  } catch (err) {
    console.error("❌ Error removing cart item:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getUserCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const sessionId = !userId ? (req as any).sessionId : undefined;

    const cartRepo = AppDataSource.getRepository(CartItem);
    const whereClause = userId ? { userId } : { sessionId };

    const items = await cartRepo.find({
      where: whereClause,
      order: { createdAt: "DESC" },
    });

    res.status(200).json(items);
  } catch (err) {
    console.error("❌ Error fetching cart:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
