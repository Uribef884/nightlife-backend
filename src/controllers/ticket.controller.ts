import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Ticket } from "../entities/Ticket";
import { Club } from "../entities/Club";
import { AuthenticatedRequest } from "../types/express";
import { TicketPurchase } from "../entities/TicketPurchase"; // Add this import if not present

// Utility to normalize today's date
const getTodayISO = (): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString().split("T")[0];
};

// ✅ CREATE TICKET
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
      isRecurrentEvent,
      clubId,
    } = req.body;

    if (!name || price == null || maxPerPerson == null || priority == null) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    if (price < 0) {
      res.status(400).json({ error: "Price must be zero or positive" });
      return;
    }

    if (maxPerPerson < 0) {
      res.status(400).json({ error: "maxPerPerson must be a non-negative number" });
      return;
    }

    if (priority < 1) {
      res.status(400).json({ error: "Priority must be at least 1" });
      return;
    }

    if (quantity != null && quantity < 0) {
      res.status(400).json({ error: "Quantity must be zero or positive" });
      return;
    }

    // Normalize availableDate to start of day
    let parsedDate: Date | undefined;
    if (availableDate) {
      parsedDate = new Date(availableDate);
      parsedDate.setHours(0, 0, 0, 0);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsedDate && parsedDate < today) {
      res.status(400).json({ error: "Available date cannot be in the past" });
      return;
    }

    const isFree = price === 0;
    const hasStock = quantity != null && quantity > 0;

    // Enforce quantity and availableDate requirements
    if (isFree) {
      if (!parsedDate) {
        res.status(400).json({ error: "Free tickets must include availableDate" });
        return;
      }
      if (!hasStock) {
        res.status(400).json({ error: "Free tickets must include a positive quantity" });
        return;
      }
    }

    if (isRecurrentEvent) {
      if (!parsedDate) {
        res.status(400).json({ error: "Recurrent tickets must include availableDate" });
        return;
      }
      if (!hasStock) {
        res.status(400).json({ error: "Recurrent tickets must include a positive quantity" });
        return;
      }
    }

    if (parsedDate && !hasStock) {
      res.status(400).json({ error: "Tickets with availableDate must include a positive quantity" });
      return;
    }

    // Role and club validation
    const clubRepo = AppDataSource.getRepository(Club);
    let club: Club | null = null;

    if (user.role === "admin") {
      if (!clubId) {
        res.status(400).json({ error: "Admin must specify clubId" });
        return;
      }
      club = await clubRepo.findOne({ where: { id: clubId }, relations: ["owner"] });
      if (!club) {
        res.status(404).json({ error: "Club not found" });
        return;
      }
    } else if (user.role === "clubowner") {
      club = await clubRepo.findOne({ where: { owner: { id: user.id } } });
      if (!club) {
        res.status(403).json({ error: "You do not own a club" });
        return;
      }
    } else {
      res.status(403).json({ error: "You are not authorized to create tickets" });
      return;
    }

    const ticket = AppDataSource.getRepository(Ticket).create({
      name,
      description,
      price,
      maxPerPerson,
      priority,
      isActive: isActive ?? true,
      availableDate: parsedDate,
      quantity,
      originalQuantity: quantity ?? null,
      isRecurrentEvent: isRecurrentEvent ?? false,
      club,
    });

    const saved = await AppDataSource.getRepository(Ticket).save(ticket);
    res.status(201).json(saved);
  } catch (error) {
    console.error("❌ Error creating ticket:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

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

  if (
    "isRecurrentEvent" in updates &&
    updates.isRecurrentEvent !== ticket.isRecurrentEvent
  ) {
    res.status(400).json({ error: "Cannot change isRecurrentEvent after creation" });
    return;
  }

  if ("price" in updates) {
    const oldIsFree = ticket.price === 0;
    const newIsFree = updates.price === 0;

    if (oldIsFree !== newIsFree) {
      res
        .status(400)
        .json({ error: "Cannot change ticket between free and paid" });
      return;
    }

    if (updates.price < 0) {
      res.status(400).json({ error: "Price must be a non-negative number" });
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

    // ❌ Cannot update quantity if originally null
    if (ticket.quantity === null) {
      res.status(400).json({
        error: "Cannot update quantity for tickets created without quantity",
      });
      return;
    }

    // ❌ Cannot set to null if originally set
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
      let soldCount = 0;

      if (ticket.isRecurrentEvent) {
        if (!ticket.availableDate) {
          res
            .status(400)
            .json({ error: "Missing availableDate for recurrent ticket" });
          return;
        }

        soldCount = await purchaseRepo.count({
          where: { ticketId: ticket.id, date: ticket.availableDate },
        });
      } else {
        soldCount = await purchaseRepo.count({ where: { ticketId: ticket.id } });
      }

      if (newQuantity < soldCount) {
        res.status(400).json({
          error: `Cannot reduce quantity below number of tickets already sold (${soldCount})`,
        });
        return;
      }
    }
  }

  if ("originalQuantity" in updates && updates.originalQuantity !== ticket.originalQuantity) {
    res.status(400).json({
      error: "originalQuantity cannot be updated after creation",
    });
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

    const todayISO = getTodayISO();

    for (const ticket of tickets) {
      const dateISO = ticket.availableDate?.toISOString().split("T")[0];
      if (dateISO && dateISO < todayISO && !ticket.isRecurrentEvent && ticket.isActive) {
        ticket.isActive = false;
        await repo.save(ticket);
      }
    }

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

    const todayISO = getTodayISO();

    for (const ticket of tickets) {
      const dateISO = ticket.availableDate?.toISOString().split("T")[0];
      if (dateISO && dateISO < todayISO && !ticket.isRecurrentEvent && ticket.isActive) {
        ticket.isActive = false;
        await repo.save(ticket);
      }
    }

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

    const todayISO = getTodayISO();
    const dateISO = ticket.availableDate?.toISOString().split("T")[0];
    if (dateISO && dateISO < todayISO && !ticket.isRecurrentEvent && ticket.isActive) {
      ticket.isActive = false;
      await ticketRepo.save(ticket);
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

    const todayISO = getTodayISO();

    for (const ticket of tickets) {
      const dateISO = ticket.availableDate?.toISOString().split("T")[0];
      if (dateISO && dateISO < todayISO && !ticket.isRecurrentEvent && ticket.isActive) {
        ticket.isActive = false;
        await ticketRepo.save(ticket);
      }
    }

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
}
