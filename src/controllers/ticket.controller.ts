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

    if (!name || price == null || !maxPerPerson || !priority) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    if (price < 0) {
      res.status(400).json({ error: "Price must be zero or positive" });
      return;
    }

    // Parse availableDate as Date (if provided)
    const parsedDate = availableDate ? new Date(availableDate) : undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (parsedDate && parsedDate < today) {
      res.status(400).json({ error: "Available date cannot be in the past" });
      return;
    }

    // If ticket has stock or is recurring, availableDate is mandatory
    const hasStockLimit = quantity != null;
    if ((hasStockLimit || isRecurrentEvent) && !parsedDate) {
      res.status(400).json({ error: "Tickets with limited quantity or recurring events must include availableDate" });
      return;
    }

    // If ticket is free, validate quantity
    const isFree = price === 0;
    if (isFree && (!quantity || quantity <= 0)) {
      res.status(400).json({ error: "Free tickets must include a positive quantity" });
      return;
    }

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
      priority: Math.max(1, priority),
      isActive: isActive ?? true,
      availableDate: parsedDate,
      quantity,
      originalQuantity: quantity ?? null, // Persist original if set
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

  // 🛑 Prevent reducing quantity below what has already been sold
  const newQuantity = updates.quantity;
  if (newQuantity != null) {
    let soldCount = 0;

    if (ticket.isRecurrentEvent) {
      if (!updates.availableDate && !ticket.availableDate) {
        res.status(400).json({ error: "Missing availableDate for recurrent ticket" });
        return;
      }
      const date = new Date(updates.availableDate || ticket.availableDate);
      soldCount = await purchaseRepo.count({
        where: { ticketId: ticket.id, date },
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

  // ✅ Allow changing to free if availableDate is present and quantity > 0
  if ("price" in updates) {
    const newPrice = Number(updates.price);
    if (isNaN(newPrice) || newPrice < 0) {
      res.status(400).json({ error: "Price must be a non-negative number" });
      return;
    }

    if (newPrice === 0) {
      const dateToCheck = updates.availableDate || ticket.availableDate;
      if (!dateToCheck || isNaN(Date.parse(dateToCheck))) {
        res.status(400).json({ error: "Free tickets must include a valid availableDate" });
        return;
      }

      if (!("quantity" in updates) || updates.quantity == null || updates.quantity <= 0) {
        res.status(400).json({ error: "Free tickets must include a positive quantity" });
        return;
      }
    }
  }

  Object.assign(ticket, updates);
  await ticketRepo.save(ticket);

  res.json({ message: "Ticket updated successfully", ticket });
};

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
};

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
};
