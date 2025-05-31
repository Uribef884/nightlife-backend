import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/CartItem";
import { AuthenticatedRequest } from "../types/express";
import { Ticket } from "../entities/Ticket";
import { toZonedTime, format } from "date-fns-tz";

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

    
    const timeZone = "America/Bogota";
    const today = toZonedTime(new Date(), timeZone);
    const todayStr = format(today, "yyyy-MM-dd", { timeZone });
    
    if (date < todayStr) {
      res.status(400).json({ error: "Cannot select a past date" });
      return;
    }

    const ticketRepo = AppDataSource.getRepository(Ticket);
    const cartRepo = AppDataSource.getRepository(CartItem);

    const ticket = await ticketRepo.findOne({
      where: { id: ticketId },
      relations: ["club"],
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (!ticket.isActive) {
       res.status(400).json({ error: "This ticket is currently inactive" });
      return;
}

    const isFree = ticket.price === 0;
    const ticketDate = ticket.availableDate instanceof Date
      ? ticket.availableDate.toISOString().split("T")[0]
      : new Date(ticket.availableDate!).toISOString().split("T")[0];

    if (isFree) {
      if (!ticket.availableDate) {
        res.status(400).json({ error: "This free ticket has no date assigned" });
        return;
      }
      if (date !== ticketDate) {
        res.status(400).json({ error: "This free ticket is only valid on its available date" });
        return;
      }
    } else {
      if (!ticket.availableDate) {
        // ✅ 🧠 NEW RULE: Don't allow adding normal covers if a special event exists that day
        const eventConflict = await ticketRepo.findOne({
          where: {
            club: { id: ticket.club.id },
            availableDate: new Date(`${date}T00:00:00`),
            isRecurrentEvent: false,
            isActive: true,
          },
        });

        if (eventConflict) {
          res.status(400).json({
            error: `You cannot buy the normal cover for ${date} because a special event already exists.`,
          });
          return;
        }

        const maxDateStr = new Date(Date.now() + 21 * 86400000).toISOString().split("T")[0];
        if (date > maxDateStr) {
          res.status(400).json({ error: "You can only select dates within 3 weeks" });
          return;
        }

        const selectedDay = new Date(`${date}T12:00:00`).toLocaleString("en-US", {
          weekday: "long",
        });

        if (!(ticket.club.openDays || []).includes(selectedDay)) {
          res.status(400).json({ error: `This club is not open on ${selectedDay}` });
          return;
        }
      } else if (ticketDate !== date) {
        res.status(400).json({ error: "This ticket is not available on that date" });
        return;
      }
    }

    const whereClause = userId ? { userId } : { sessionId };
    const existingItems = await cartRepo.find({
      where: whereClause,
      relations: ["ticket", "ticket.club"],
    });

    for (const item of existingItems) {
      if (item.ticket.club.id !== ticket.club.id) {
        res.status(400).json({ error: "All tickets in cart must be from the same nightclub" });
        return;
      }
      if (item.date !== date) {
        res.status(400).json({ error: "All tickets in cart must be for the same date" });
        return;
      }
    }

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

    if (ticket.quantity != null) {
      const totalCartQuantity = existingItems
        .filter(item => item.ticket.id === ticketId && item.date === date)
        .reduce((sum, item) => sum + item.quantity, 0);

      if (totalCartQuantity + quantity > ticket.quantity) {
        res.status(400).json({
          error: `Only ${ticket.quantity - totalCartQuantity} tickets are available`,
        });
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

    // 🔒 Prevent quantity updates beyond per-person max
    if (quantity > ticket.maxPerPerson) {
      res.status(400).json({ error: `You can only buy up to ${ticket.maxPerPerson} tickets` });
      return;
    }

    // 🔒 Enforce total stock limits if ticket has a defined quantity (free or paid)
    if (ticket.quantity != null) {
      const allCartItems = await cartRepo.find({
        where: userId ? { userId } : { sessionId },
        relations: ["ticket"], // ✅ Ensure tickets are loaded
      });

      const otherCartQuantity = allCartItems
        .filter(c => c.ticket?.id === ticket.id && c.date === item.date && c.id !== item.id)
        .reduce((sum, c) => sum + c.quantity, 0);

      if (otherCartQuantity + quantity > ticket.quantity) {
        const remaining = ticket.quantity - otherCartQuantity;
        res.status(400).json({
          error: `Only ${remaining} tickets are available for this event`,
        });
        return;
      }
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
