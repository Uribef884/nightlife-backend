import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/CartItem";
import { AuthenticatedRequest } from "../types/express";
import { Ticket } from "../entities/Ticket";

export const addToCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { ticketId, date, quantity } = req.body;
    const userId = req.user?.id;

    if (!ticketId || !date || quantity == null) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    if (typeof quantity !== "number" || quantity <= 0) {
      res.status(400).json({ error: "Quantity must be a positive number" });
      return;
    }

    // Validate date format and logic
    const inputDate = new Date(date);
    const today = new Date();
    const maxDate = new Date();
    maxDate.setDate(today.getDate() + 21);

    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;
    const parsedToday = new Date(todayStr);

    if (inputDate < parsedToday) {
      res.status(400).json({ error: "Cannot select a past date" });
      return;
    }

    if (inputDate > maxDate) {
      res.status(400).json({ error: "You can only select dates within 3 weeks" });
      return;
    }

    const ticketRepo = AppDataSource.getRepository(Ticket);
    const cartRepo = AppDataSource.getRepository(CartItem);

    const ticket = await ticketRepo.findOne({
      where: { id: ticketId },
      relations: ["club"]
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const cartItems = await cartRepo.find({
      where: userId ? { userId } : {},
      relations: ["ticket", "ticket.club"]
    });

    if (cartItems.length > 0) {
      const { ticket: existingTicket, date: existingDate } = cartItems[0];

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
      where: userId ? { userId, ticketId, date } : { ticketId, date }
    });

    const currentTotal = (existing?.quantity || 0) + quantity;
    if (currentTotal > ticket.maxPerPerson) {
      res.status(400).json({
        error: `You can only buy up to ${ticket.maxPerPerson} tickets of this type`
      });
      return;
    }

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
      ...(userId && { userId })
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
    const cartRepo = AppDataSource.getRepository(CartItem);
    const ticketRepo = AppDataSource.getRepository(Ticket);

    if (typeof quantity !== "number" || quantity <= 0) {
      res.status(400).json({ error: "Quantity must be a positive number" });
      return;
    }

    const item = await cartRepo.findOne({
      where: { id },
      relations: ["ticket"]
    });

    if (!item) {
      res.status(404).json({ error: "Cart item not found" });
      return;
    }

    const ticket = await ticketRepo.findOneBy({ id: item.ticketId });
    if (!ticket) {
      res.status(404).json({ error: "Associated ticket not found" });
      return;
    }

    if (quantity > ticket.maxPerPerson) {
      res.status(400).json({
        error: `You can only buy up to ${ticket.maxPerPerson} tickets of this type`
      });
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
    const cartRepo = AppDataSource.getRepository(CartItem);

    const item = await cartRepo.findOneBy({ id });
    if (!item) {
      res.status(404).json({ error: "Cart item not found" });
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
    const cartRepo = AppDataSource.getRepository(CartItem);

    const userId = req.user?.id;
    const whereClause = userId ? { userId } : {};

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

