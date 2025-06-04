import { Request, Response, NextFunction } from "express";
import { TicketCategory } from "../entities/Ticket";
import { AppDataSource } from "../config/data-source";
import { Event } from "../entities/Event";

export const validateTicketInput = (req: Request, res: Response, next: NextFunction): void => {
  const {
    category,
    price,
    quantity,
    availableDate,
    eventId,
  } = req.body;

  try {
    const parsedPrice = parseFloat(price);
    const parsedQuantity = quantity !== undefined ? parseInt(quantity, 10) : undefined;

    if (!Object.values(TicketCategory).includes(category)) {
      res.status(400).json({ error: `Invalid category: ${category}` });
      return;
    }

    // ✅ Normal Covers (general, VIP, palco, combo)
    if (
      category === TicketCategory.GENERAL
    ) {
      if (availableDate) {
        res.status(400).json({ error: "Normal covers must not have an availableDate" });
        return;
      }

      if (quantity !== undefined) {
        res.status(400).json({ error: "Normal covers must not have a quantity" });
        return;
      }

      if (parsedPrice <= 0) {
        res.status(400).json({ error: "Normal covers must have a price greater than 0" });
        return;
      }

      if (eventId) {
        res.status(400).json({ error: "Normal covers cannot be linked to events" });
        return;
      }

      return next();
    }

    // ✅ Free tickets
    if (category === TicketCategory.FREE) {
      if (parsedPrice !== 0) {
        res.status(400).json({ error: "Free tickets must have price 0" });
        return;
      }

      if (!availableDate) {
        res.status(400).json({ error: "Free tickets must have an availableDate" });
        return;
      }

      if (parsedQuantity == null || parsedQuantity <= 0) {
        res.status(400).json({ error: "Free tickets must have a valid quantity" });
        return;
      }

      if (eventId) {
        res.status(400).json({ error: "Free tickets must not be linked to events" });
        return;
     }

      return next();
    }

    // ✅ Event tickets
    if (category === TicketCategory.EVENT) {
      if (!eventId) {
        res.status(400).json({ error: "Event tickets must be linked to an event" });
        return;
      }

      if (availableDate) {
        res.status(400).json({ error: "Event tickets must not manually set availableDate" });
        return;
      }

      if (parsedQuantity == null || parsedQuantity <= 0) {
        res.status(400).json({ error: "Event tickets must have a valid quantity" });
        return;
      }

      // Async DB call workaround in sync middleware
      AppDataSource.getRepository(Event)
        .findOne({ where: { id: eventId } })
        .then((event) => {
          if (!event) {
            res.status(400).json({ error: "Event not found for eventId" });
            return;
          }
          next();
        })
        .catch((err) => {
          console.error("❌ Ticket validation DB error:", err);
          res.status(500).json({ error: "Internal server error during validation" });
        });

      return;
    }

    // Fallback
    res.status(400).json({ error: "Unknown ticket category" });
  } catch (error) {
    console.error("❌ Ticket validation failed:", error);
    res.status(500).json({ error: "Internal server error during validation" });
  }
};
