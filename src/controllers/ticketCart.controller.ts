import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/TicketCartItem";
import { AuthenticatedRequest } from "../types/express";
import { computeDynamicPrice, computeDynamicEventPrice, getNormalTicketDynamicPricingReason, getEventTicketDynamicPricingReason } from "../utils/dynamicPricing";
import { Ticket, TicketCategory } from "../entities/Ticket";
import { MenuCartItem } from "../entities/MenuCartItem";
import { toZonedTime, format } from "date-fns-tz";
import { TicketIncludedMenuItem } from "../entities/TicketIncludedMenuItem";
import { calculatePlatformFee, calculateGatewayFees } from "../utils/ticketfeeUtils";
import { getTicketCommissionRate } from "../config/fees";
import { summarizeCartTotals } from "../utils/cartSummary";

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

    // Check if event has passed grace period for event tickets
    if (ticket.category === "event") {
      let eventDate: Date;
      let eventOpenHours: { open: string, close: string } | undefined;

      if (ticket.event) {
        eventDate = new Date(ticket.event.availableDate);
        eventOpenHours = ticket.event.openHours;
      } else if (ticket.availableDate) {
        eventDate = new Date(ticket.availableDate);
      } else {
        res.status(400).json({ error: "Event ticket missing event date" });
        return;
      }

      // Check if event has passed grace period (regardless of dynamic pricing setting)
      const dynamicPrice = computeDynamicEventPrice(Number(ticket.price), eventDate, eventOpenHours);
      if (dynamicPrice === -1) {
        res.status(400).json({ 
          error: `Event "${ticket.name}" has already started and is no longer available for purchase.` 
        });
        return;
      }
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
          category: TicketCategory.EVENT, // Only check for paid events, not free events
        },
      });

      if (conflictEvent) {
        res.status(400).json({
          error: `You cannot buy a general cover for ${date} because a paid event already exists.`,
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

    // Check cart exclusivity rules
    const isEventTicket = ticket.category === "event";
    const isFreeTicket = ticket.category === "free";
    
    // Check if cart has event tickets (event tickets have priority)
    const hasEventTickets = existingItems.some(item => item.ticket.category === "event");
    
    if (hasEventTickets) {
      if (!isEventTicket) {
        res.status(400).json({ error: "Cannot add non-event tickets when event tickets are in cart. Event tickets have priority." });
        return;
      }
    } else if (isEventTicket) {
      // Event tickets cannot coexist with any other tickets
      if (existingItems.length > 0) {
        res.status(400).json({ error: "Cannot add event tickets when other tickets are in cart. Please clear your cart first." });
        return;
      }
    }

    // Check club and date consistency
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

export const getCartItems = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

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

    // Calculate dynamic prices for each item
    const itemsWithDynamicPrices = await Promise.all(items.map(async item => {
      const ticket = item.ticket;
      if (!ticket) return item;

      const basePrice = Number(ticket.price);
      let dynamicPrice = basePrice;

      if (ticket.dynamicPricingEnabled && ticket.club) {
        if (ticket.category === "event" && ticket.availableDate) {
          let eventDate: Date;
          if (typeof ticket.availableDate === "string") {
            const [year, month, day] = (ticket.availableDate as string).split("-").map(Number);
            eventDate = new Date(year, month - 1, day);
          } else {
            eventDate = new Date(ticket.availableDate);
          }

          dynamicPrice = computeDynamicEventPrice(Number(ticket.price), eventDate, ticket.event?.openHours);
          if (dynamicPrice === -1) dynamicPrice = 0;
        } else {
          dynamicPrice = computeDynamicPrice({
            basePrice,
            clubOpenDays: ticket.club.openDays,
            openHours: ticket.club.openHours,
            availableDate: new Date(item.date),
            useDateBasedLogic: false,
          });
        }
      } else if (ticket.category === "event") {
        // Grace period check for event tickets when dynamic pricing is disabled
        if (ticket.availableDate) {
          let eventDate: Date;
          if (typeof ticket.availableDate === "string") {
            const [year, month, day] = (ticket.availableDate as string).split("-").map(Number);
            eventDate = new Date(year, month - 1, day);
          } else {
            eventDate = new Date(ticket.availableDate);
          }

          const gracePeriodCheck = computeDynamicEventPrice(Number(ticket.price), eventDate, ticket.event?.openHours);
          if (gracePeriodCheck === -1) {
            dynamicPrice = 0; // Set to 0 to indicate unavailable
          } else if (gracePeriodCheck > basePrice) {
            // If grace period price is higher than base price, use grace period price
            dynamicPrice = gracePeriodCheck;
          }
        }
      }

      // Add dynamic price to the ticket object
      return {
        ...item,
        ticket: {
          ...ticket,
          dynamicPrice: dynamicPrice
        }
      };
    }));

    res.status(200).json(itemsWithDynamicPrices);
  } catch (err) {
    console.error("❌ Error fetching cart items:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getCartSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

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

    const pricingInfo = await Promise.all(items.map(async item => {
      const ticket = item.ticket;
      if (!ticket) return null;

      // 🧠 Optional: prefetch included menu items for other controller logic, but not used here
      if (ticket.includesMenuItem) {
        const repo = AppDataSource.getRepository(TicketIncludedMenuItem);
        await repo.find({
          where: { ticketId: ticket.id },
          relations: ["menuItem", "variant"]
        });
      }

      const basePrice = Number(ticket.price);
      let dynamicPrice = basePrice;

      if (ticket.dynamicPricingEnabled && ticket.club) {
        if (ticket.category === "event" && ticket.availableDate) {
          let eventDate: Date;
          if (typeof ticket.availableDate === "string") {
            const [year, month, day] = (ticket.availableDate as string).split("-").map(Number);
            eventDate = new Date(year, month - 1, day);
          } else {
            eventDate = new Date(ticket.availableDate);
          }

          dynamicPrice = computeDynamicEventPrice(Number(ticket.price), eventDate, ticket.event?.openHours);
          if (dynamicPrice === -1) dynamicPrice = 0;
        } else {
          dynamicPrice = computeDynamicPrice({
            basePrice,
            clubOpenDays: ticket.club.openDays,
            openHours: ticket.club.openHours,
            availableDate: new Date(item.date),
            useDateBasedLogic: false,
          });
        }
      } else if (ticket.category === "event") {
        // Grace period check for event tickets when dynamic pricing is disabled
        if (ticket.availableDate) {
          let eventDate: Date;
          if (typeof ticket.availableDate === "string") {
            const [year, month, day] = (ticket.availableDate as string).split("-").map(Number);
            eventDate = new Date(year, month - 1, day);
          } else {
            eventDate = new Date(ticket.availableDate);
          }

          const gracePeriodCheck = computeDynamicEventPrice(Number(ticket.price), eventDate, ticket.event?.openHours);
          if (gracePeriodCheck === -1) {
            dynamicPrice = 0; // Set to 0 to indicate unavailable
          } else if (gracePeriodCheck > basePrice) {
            // If grace period price is higher than base price, use grace period price
            dynamicPrice = gracePeriodCheck;
          }
        }
      }

      return {
        itemTotal: dynamicPrice * item.quantity,
        isEvent: ticket.category === "event"
      };
    }));

    const filteredPricing = pricingInfo.filter((i): i is { itemTotal: number; isEvent: boolean } => i !== null);
    const summary = summarizeCartTotals(filteredPricing, "ticket");
    res.status(200).json(summary);
  } catch (err) {
    console.error("❌ Error fetching cart summary:", err);
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