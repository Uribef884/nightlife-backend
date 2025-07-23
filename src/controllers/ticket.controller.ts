import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Ticket } from "../entities/Ticket";
import { Club } from "../entities/Club";
import { AuthenticatedRequest } from "../types/express";
import { TicketPurchase } from "../entities/TicketPurchase"; 
import { Event } from "../entities/Event";
import { TicketCategory } from "../entities/Ticket";

// Utility to normalize today's date
const getTodayISO = (): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString().split("T")[0];
};

// CREATE TICKET
export async function createTicket(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const {
      name,
      description,
      price,
      maxPerPerson,
      priority,
      isActive,
      availableDate,
      quantity,
      category,
      eventId, // ✅ clubId removed from destructuring
      dynamicPricingEnabled, // <-- add this to destructuring
    } = req.body;

    if (!name || price == null || maxPerPerson == null || priority == null || !category) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    if (price < 0 || maxPerPerson < 0 || priority < 1) {
      res.status(400).json({ error: "Invalid price, maxPerPerson, or priority" });
      return;
    }

    const clubRepo = AppDataSource.getRepository(Club);
    let club: Club | null = null;

    // 🔐 Admins must specify clubId
    if (user.role === "admin") {
      const { clubId } = req.body;
      if (!clubId) {
        res.status(400).json({ error: "Admin must specify clubId" });
        return;
      }
      club = await clubRepo.findOne({ where: { id: clubId }, relations: ["owner"] });
    }

    // 🔐 Clubowners derive clubId from login
    else if (user.role === "clubowner") {
      club = await clubRepo.findOne({ where: { ownerId: user.id } });
    }

    if (!club) {
      res.status(403).json({ error: "Unauthorized or club not found" });
      return;
    }

    // 📅 Normalize available date
    let parsedDate: Date | null = null;
    let event: Event | null = null;

    if (eventId) {
      const eventRepo = AppDataSource.getRepository(Event);
      event = await eventRepo.findOne({ where: { id: eventId }, relations: ["club"] });

      if (!event || event.clubId !== club.id) {
        res.status(404).json({ error: "Event not found or not owned by your club" });
        return;
      }

      const [year, month, day] = String(event.availableDate).split("T")[0].split("-").map(Number);
      parsedDate = new Date(year, month - 1, day);
    } else if (availableDate) {
      const [year, month, day] = availableDate.split("-").map(Number);
      parsedDate = new Date(year, month - 1, day);
      parsedDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsedDate < today) {
        res.status(400).json({ error: "Available date cannot be in the past" });
        return;
      }
    }

    let dynamicPricing = false;
    if (category === TicketCategory.FREE || price == 0) {
      dynamicPricing = false;
    } else {
      dynamicPricing = !!dynamicPricingEnabled;
    }

    const ticketRepo = AppDataSource.getRepository(Ticket);
    const ticket = ticketRepo.create({
      name,
      description,
      price,
      maxPerPerson,
      priority,
      isActive: isActive ?? true,
      availableDate: parsedDate ?? undefined,
      quantity: quantity ?? null,
      originalQuantity: quantity ?? null,
      category,
      club, // ✅ set by lookup, not user input
      ...(event ? { event } : {}),
      dynamicPricingEnabled: dynamicPricing,
    });

    const saved = await ticketRepo.save(ticket);
    res.status(201).json(saved);
  } catch (error) {
    console.error("❌ Error creating ticket:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ✅ UPDATE TICKET
export const updateTicket = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  const updates = req.body;

  const ticketRepo = AppDataSource.getRepository(Ticket);
  const purchaseRepo = AppDataSource.getRepository(TicketPurchase);

  const ticket = await ticketRepo.findOne({
    where: { id },
    relations: ["club", "club.owner"],
  });

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  if (user.role === "clubowner" && ticket.club.ownerId !== user.id) {
    res.status(403).json({ error: "You are not authorized to update this ticket" });
    return;
  }

  // ❌ Prevent changing category
  if ("category" in updates && updates.category !== ticket.category) {
    res.status(400).json({
      error: "Cannot change category after ticket creation",
    });
    return;
  }

  // ❌ Prevent changing eventId
  if ("eventId" in updates && updates.eventId !== ticket.eventId) {
    res.status(400).json({
      error: "Cannot change eventId after ticket creation",
    });
    return;
  }

  if ("availableDate" in updates && updates.availableDate) {
    const normalizedUpdate = new Date(updates.availableDate);
    normalizedUpdate.setHours(0, 0, 0, 0);

    const normalizedExisting = ticket.availableDate
      ? new Date(ticket.availableDate)
      : null;

    if (
      normalizedExisting &&
      normalizedUpdate.getTime() !== normalizedExisting.getTime()
    ) {
      res.status(400).json({ error: "Cannot update availableDate after creation" });
      return;
    }
  }

  if ("price" in updates) {
    const newPrice = parseFloat(updates.price);

    if (isNaN(newPrice) || newPrice < 0) {
      res.status(400).json({ error: "Price must be a non-negative number" });
      return;
    }

    // Lock based on category
    if (ticket.category === TicketCategory.FREE && newPrice !== 0) {
      res.status(400).json({
        error: "Cannot change price of a free ticket to a non-zero value",
      });
      return;
    }

    if (
      ticket.category !== TicketCategory.FREE &&
      ticket.price === 0 &&
      newPrice > 0
    ) {
      res.status(400).json({
        error: "Cannot change a free ticket to a paid ticket",
      });
      return;
    }

    if (
      ticket.category !== TicketCategory.FREE &&
      ticket.price > 0 &&
      newPrice === 0
    ) {
      res.status(400).json({
        error: "Cannot change a paid ticket to free",
      });
      return;
    }
  }


  if ("maxPerPerson" in updates && updates.maxPerPerson < 0) {
    res.status(400).json({ error: "maxPerPerson must be a non-negative number" });
    return;
  }

  if ("priority" in updates && updates.priority < 1) {
    res.status(400).json({ error: "priority must be at least 1" });
    return;
  }

  if ("quantity" in updates) {
    const newQuantity = updates.quantity;

    if (ticket.quantity === null) {
      res.status(400).json({
        error: "Cannot update quantity for tickets created without quantity",
      });
      return;
    }

    if (ticket.quantity !== null && newQuantity === null) {
      res.status(400).json({
        error: "Cannot remove quantity from tickets that originally had one",
      });
      return;
    }

    if (newQuantity != null && newQuantity < 0) {
      res.status(400).json({ error: "Quantity must be non-negative" });
      return;
    }

    if (newQuantity != null) {
      const soldCount = await purchaseRepo.count({ where: { ticketId: ticket.id } });

      if (newQuantity < soldCount) {
        res.status(400).json({
          error: `Cannot reduce quantity below number of tickets already sold (${soldCount})`,
        });
        return;
      }
    }
  }

  if (
    "originalQuantity" in updates &&
    updates.originalQuantity !== ticket.originalQuantity
  ) {
    res.status(400).json({
      error: "originalQuantity cannot be updated after creation",
    });
    return;
  }

  if ("clubId" in updates && updates.clubId !== ticket.clubId) {
  res.status(400).json({ error: "clubId cannot be updated" });
  return;
  }

  Object.assign(ticket, updates);
  await ticketRepo.save(ticket);

  res.json({ message: "Ticket updated successfully", ticket });
};

// ✅ GET ALL TICKETS
export async function getAllTickets(req: Request, res: Response): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(Ticket);
    const tickets = await repo.find({
      where: { isActive: true },
      relations: ["club"],
      order: { priority: "ASC" },
    });

    const formatted = tickets.map((t) => ({
      ...t,
      soldOut: t.quantity !== null && t.quantity === 0,
    }));

    res.json(formatted);
  } catch (error) {
    console.error("❌ Error fetching tickets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ✅ GET TICKETS BY CLUB
export async function getTicketsByClub(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(Ticket);
    const tickets = await repo.find({
      where: { club: { id } },
      order: { priority: "ASC" },
    });

    const formatted = tickets.map((t) => ({
      ...t,
      soldOut: t.quantity !== null && t.quantity === 0,
    }));

    res.json(formatted);
  } catch (error) {
    console.error("❌ Error fetching tickets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ✅ GET TICKET BY ID
export async function getTicketById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const ticketRepo = AppDataSource.getRepository(Ticket);
    const { id } = req.params;

    const ticket = await ticketRepo.findOne({ where: { id }, relations: ["club"] });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (user.role === "clubowner" && ticket.club.ownerId !== user.id) {
      res.status(403).json({ error: "Forbidden: This ticket doesn't belong to your club" });
      return;
    }

    const response = {
      ...ticket,
      soldOut: ticket.quantity !== null && ticket.quantity === 0,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("❌ Error fetching ticket by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ✅ GET TICKETS FOR MY CLUB
export const getTicketsForMyClub = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Forbidden: Only clubowners can access this" });
      return;
    }

    const clubRepo = AppDataSource.getRepository(Club);
    const ticketRepo = AppDataSource.getRepository(Ticket);

    const club = await clubRepo.findOne({ where: { ownerId: user.id } });

    if (!club) {
      res.status(404).json({ error: "Club not found for this user" });
      return;
    }

    const tickets = await ticketRepo.find({
      where: { club: { id: club.id } },
      order: { priority: "ASC" },
    });

    const formatted = tickets.map((t) => ({
      ...t,
      soldOut: t.quantity !== null && t.quantity === 0,
    }));

    res.json(formatted);
  } catch (error) {
    console.error("❌ Error fetching my club's tickets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ✅ DELETE TICKET
export async function deleteTicket(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const repo = AppDataSource.getRepository(Ticket);
    const ticket = await repo.findOne({ where: { id }, relations: ["club", "club.owner"] });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (user.role === "clubowner" && ticket.club.ownerId !== user.id) {
      res.status(403).json({ error: "You are not authorized to delete this ticket" });
      return;
    }

    await repo.remove(ticket);
    res.json({ message: "Ticket deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting ticket:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ✅ TOGGLE VISIBILITY
export const toggleTicketVisibility = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const repo = AppDataSource.getRepository(Ticket);

    const ticket = await repo.findOne({ where: { id }, relations: ["club", "club.owner"] });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (user.role === "clubowner" && ticket.club.ownerId !== user.id) {
      res.status(403).json({ error: "You are not authorized to modify this ticket" });
      return;
    }

    ticket.isActive = !ticket.isActive;
    await repo.save(ticket);

    res.json({ message: "Ticket visibility toggled", isActive: ticket.isActive });
  } catch (error) {
    console.error("❌ Error toggling ticket visibility:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PATCH /tickets/:id/toggle-dynamic-pricing — toggle dynamicPricingEnabled
export const toggleTicketDynamicPricing = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const repo = AppDataSource.getRepository(Ticket);
    const ticket = await repo.findOne({ where: { id }, relations: ["club", "club.owner"] });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (user.role === "clubowner" && ticket.club.ownerId !== user.id) {
      res.status(403).json({ error: "You are not authorized to modify this ticket" });
      return;
    }

    // Prevent enabling dynamic pricing for free tickets
    if ((ticket.category === TicketCategory.FREE || ticket.price === 0) && !ticket.dynamicPricingEnabled) {
      res.status(400).json({ error: "Dynamic pricing cannot be enabled for free tickets." });
      return;
    }
    if ((ticket.category === TicketCategory.FREE || ticket.price === 0) && ticket.dynamicPricingEnabled) {
      // Allow disabling if currently enabled (shouldn't happen, but for safety)
      ticket.dynamicPricingEnabled = false;
      await repo.save(ticket);
      res.json({ message: "Ticket dynamic pricing toggled", dynamicPricingEnabled: ticket.dynamicPricingEnabled });
      return;
    }

    ticket.dynamicPricingEnabled = !ticket.dynamicPricingEnabled;
    await repo.save(ticket);

    res.json({ message: "Ticket dynamic pricing toggled", dynamicPricingEnabled: ticket.dynamicPricingEnabled });
  } catch (error) {
    console.error("❌ Error toggling ticket dynamic pricing:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
