import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/TicketCartItem";
import { AuthenticatedRequest } from "../types/express";
import { computeDynamicPrice } from "../utils/dynamicPricing";
import { Ticket } from "../entities/Ticket";
import { MenuCartItem } from "../entities/MenuCartItem";
import { toZonedTime, format } from "date-fns-tz";
import { TicketIncludedMenuItem } from "../entities/TicketIncludedMenuItem";

function ownsCartItem(item: CartItem, userId?: string, sessionId?: string): boolean {
  if (userId) return item.userId === userId;
  return item.sessionId === sessionId;
}

export const addToCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { ticketId, date, quantity } = req.body;
    const userId: string | undefined = req.user?.id;
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

    // Ensure we have either a userId or sessionId
    if (!userId && !sessionId) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }

    if (!ticketId || !date || quantity == null || quantity <= 0) {
      res.status(400).json({ error: "Missing or invalid fields" });
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
    const ticket = await ticketRepo.findOne({ where: { id: ticketId }, relations: ["club", "event"] });

    if (!ticket || !ticket.isActive) {
      res.status(404).json({ error: "Ticket not found or inactive" });
      return;
    }

    const menuCartRepo = AppDataSource.getRepository(MenuCartItem);
    const existingMenuItems = await menuCartRepo.find({ where: userId ? { userId } : { sessionId } });
    if (existingMenuItems.length > 0) {
      res.status(400).json({ error: "You must complete or clear your menu cart before adding tickets." });
      return;
    }

    const isFree = ticket.category === "free";
    const ticketDate = ticket.availableDate instanceof Date
      ? ticket.availableDate.toISOString().split("T")[0]
      : ticket.availableDate
        ? new Date(ticket.availableDate).toISOString().split("T")[0]
        : undefined;

    if (isFree && (!ticketDate || ticketDate !== date)) {
      res.status(400).json({ error: "This free ticket is only valid on its available date" });
      return;
    }

    if (!isFree && !ticket.availableDate && ticket.category === "general") {
      const conflictEvent = await ticketRepo.findOne({
        where: {
          club: { id: ticket.club.id },
          availableDate: new Date(`${date}T00:00:00`),
          isActive: true,
        },
      });

      if (conflictEvent) {
        res.status(400).json({
          error: `You cannot buy a general cover for ${date} because a special event already exists.`,
        });
        return;
      }

      const maxDateStr = new Date(Date.now() + 21 * 86400000).toISOString().split("T")[0];
      if (date > maxDateStr) {
        res.status(400).json({ error: "You can only select dates within 3 weeks" });
        return;
      }

      const selectedDay = new Date(`${date}T12:00:00`).toLocaleString("en-US", { weekday: "long" });
      if (!(ticket.club.openDays || []).includes(selectedDay)) {
        res.status(400).json({ error: `This club is not open on ${selectedDay}` });
        return;
      }
    } else if (!isFree && ticketDate !== date) {
      res.status(400).json({ error: "This ticket is not available on that date" });
      return;
    }

    const whereClause = userId ? { userId } : { sessionId };
    const existingItems = await cartRepo.find({ where: whereClause, relations: ["ticket", "ticket.club"] });

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

    const existing = await cartRepo.findOne({
      where: { ...whereClause, ticketId, date },
      relations: ["ticket", "ticket.club"],
    });

    if (existing) {
      const newTotal = existing.quantity + quantity;
      if (newTotal > ticket.maxPerPerson) {
        res.status(400).json({ error: `Cannot exceed maximum of ${ticket.maxPerPerson} tickets per person` });
        return;
      }

      existing.quantity = newTotal;
      await cartRepo.save(existing);
      res.status(200).json(existing);
    } else {
      const newItem = cartRepo.create({
        ticketId,
        date,
        quantity,
        ...(userId ? { userId } : { sessionId }),
      });

      await cartRepo.save(newItem);
      res.status(201).json(newItem);
    }
  } catch (err) {
    console.error("❌ Error adding to ticket cart:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateCartItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id, quantity } = req.body;
    const userId = req.user?.id;
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

    // Ensure we have either a userId or sessionId
    if (!userId && !sessionId) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }

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

    if (ticket.quantity != null) {
      const allCartItems = await cartRepo.find({
        where: userId ? { userId } : { sessionId },
        relations: ["ticket"],
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
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

    // Ensure we have either a userId or sessionId
    if (!userId && !sessionId) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }

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
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

    // Ensure we have either a userId or sessionId
    if (!userId && !sessionId) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }

    const cartRepo = AppDataSource.getRepository(CartItem);
    const whereClause = userId ? { userId } : { sessionId };

    const items = await cartRepo.find({
      where: whereClause,
      relations: ["ticket", "ticket.club", "ticket.event"],
      order: { createdAt: "DESC" },
    });

    // For each cart item, if ticket.includesMenuItem, fetch included menu items
    const formatted = await Promise.all(items.map(async item => {
      const ticket = item.ticket;
      let menuItems: Array<{
        id: string;
        menuItemId: string;
        menuItemName: string;
        variantId?: string;
        variantName: string | null;
        quantity: number;
      }> = [];
      
      if (ticket && ticket.includesMenuItem) {
        const repo = AppDataSource.getRepository(TicketIncludedMenuItem);
        const included = await repo.find({
          where: { ticketId: ticket.id },
          relations: ["menuItem", "variant"]
        });
        menuItems = included.map(i => ({
          id: i.id,
          menuItemId: i.menuItemId,
          menuItemName: i.menuItem?.name ?? null,
          variantId: i.variantId,
          variantName: i.variant?.name ?? null,
          quantity: i.quantity
        }));
      }

      // Calculate dynamic pricing
      const basePrice = Number(ticket.price);
      let dynamicPrice = basePrice;
      
      if (ticket.dynamicPricingEnabled && ticket.club) {
        // For event tickets, use the event date and open hours
        if (ticket.category === "event" && ticket.availableDate) {
          // Check if the ticket has an associated event with open hours
          if (ticket.event && ticket.event.openHours && ticket.event.openHours.open && ticket.event.openHours.close) {
            // Use event's open hours for dynamic pricing
            let eventDate: Date;
            
            // Handle availableDate which can be Date or string from database
            if (ticket.availableDate instanceof Date) {
              eventDate = new Date(ticket.availableDate);
            } else if (typeof ticket.availableDate === 'string') {
              // If it's a date string like "2025-07-25", parse it as local date
              const dateStr = ticket.availableDate as string;
              const [year, month, day] = dateStr.split('-').map(Number);
              eventDate = new Date(year, month - 1, day); // month is 0-indexed
            } else {
              // Fallback
              eventDate = new Date(ticket.availableDate);
            }
            
            const [openHour, openMinute] = ticket.event.openHours.open.split(':').map(Number);
            
            // Create the event open time in local timezone
            const eventOpenTime = new Date(
              eventDate.getFullYear(),
              eventDate.getMonth(),
              eventDate.getDate(),
              openHour,
              openMinute,
              0,
              0
            );
            
            dynamicPrice = computeDynamicPrice({
              basePrice,
              clubOpenDays: ticket.club.openDays,
              openHours: ticket.club.openHours, // Fallback to club hours if needed
              availableDate: eventOpenTime, // Use event's open time as the reference
              useDateBasedLogic: true, // Use date-based logic with event's open time
            });
          } else {
            // Fallback to using just the event date
            dynamicPrice = computeDynamicPrice({
              basePrice,
              clubOpenDays: ticket.club.openDays,
              openHours: ticket.club.openHours,
              availableDate: ticket.availableDate,
              useDateBasedLogic: true,
            });
          }
        } else {
          // For general tickets, use the cart item date
          dynamicPrice = computeDynamicPrice({
            basePrice,
            clubOpenDays: ticket.club.openDays,
            openHours: ticket.club.openHours,
            availableDate: new Date(item.date),
            useDateBasedLogic: false,
          });
        }
      }

      return {
        id: item.id,
        ticketId: item.ticketId,
        quantity: item.quantity,
        date: item.date,
        ticket: {
          ...ticket,
          price: basePrice,
          dynamicPrice: dynamicPrice
        },
        menuItems,
        includedMenuItems: menuItems, // Add this for frontend compatibility
        basePrice,
        dynamicPrice,
        discountApplied: Math.max(0, basePrice - dynamicPrice)
      };
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error("❌ Error fetching cart:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const clearCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

    // Ensure we have either a userId or sessionId
    if (!userId && !sessionId) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }

    const cartRepo = AppDataSource.getRepository(CartItem);
    const whereClause = userId ? { userId } : { sessionId };

    await cartRepo.delete(whereClause);
    res.status(204).send();
  } catch (err) {
    console.error("❌ Error clearing ticket cart:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

//Used if user want to add menuitem to existing ticket cart
export const clearMenuCartFromTicket = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const sessionId = !userId ? req.sessionId : undefined;

    // Ensure we have either a userId or sessionId
    if (!userId && !sessionId) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }

    const menuCartRepo = AppDataSource.getRepository("menu_cart_item");
    const whereClause = userId ? { userId } : { sessionId };
    await menuCartRepo.delete(whereClause);

    res.status(204).send();
  } catch (err) {
    console.error("❌ Error clearing menu cart from ticket flow:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};