import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Ticket } from "../entities/Ticket";
import { Club } from "../entities/Club";
import { AuthenticatedRequest } from "../types/express";

export async function createTicket(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const repo = AppDataSource.getRepository(Ticket);
    const clubRepo = AppDataSource.getRepository(Club);

    const {
      name,
      description,
      price,
      maxPerPerson,
      priority,
      isActive,
      availableDates,
      clubId // Optional: only admin should use this
    } = req.body;

    if (!name || price == null || !maxPerPerson || !priority) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    let club: Club | null = null;

    if (user.role === "admin") {
      if (!clubId) {
        res.status(400).json({ error: "Admin must specify clubId" });
        return;
      }

      club = await clubRepo.findOne({
        where: { id: clubId },
        relations: ["owner"]
      });

      if (!club) {
        res.status(404).json({ error: "Club not found" });
        return;
      }
    } else if (user.role === "clubowner") {
      club = await clubRepo.findOne({
        where: { owner: { id: user.id } },
      });

      if (!club) {
        res.status(403).json({ error: "You do not own a club" });
        return;
      }
    } else {
      res.status(403).json({ error: "You are not authorized to create tickets" });
      return;
    }

    const ticket = repo.create({
      name,
      description,
      price,
      maxPerPerson,
      priority: Math.max(1, priority),
      isActive: isActive ?? true,
      availableDates,
      club,
    });

    const saved = await repo.save(ticket);
    res.status(201).json(saved);
  } catch (error) {
    console.error("❌ Error creating ticket:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getTicketsByClub(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(Ticket);

    const tickets = await repo.find({
      where: { club: { id } },
      order: { priority: "ASC" }
    });

    res.json(tickets);
  } catch (error) {
    console.error("❌ Error fetching tickets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getAllTickets(req: Request, res: Response): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(Ticket);
    const tickets = await repo.find({
      where: { isActive: true },
      relations: ["club"],
      order: { priority: "ASC" },
    });

    res.json(tickets);
  } catch (error) {
    console.error("❌ Error fetching tickets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getTicketById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const ticketRepo = AppDataSource.getRepository(Ticket);
    const { id } = req.params;

    const ticket = await ticketRepo.findOne({
      where: { id },
      relations: ["club"],
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (user.role === "clubowner" && ticket.club.ownerId !== user.id) {
      res.status(403).json({ error: "Forbidden: This ticket doesn't belong to your club" });
      return;
    }

    res.status(200).json(ticket);
  } catch (error) {
    console.error("❌ Error fetching ticket by ID:", error);
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

    const ticket = await repo.findOne({
      where: { id },
      relations: ["club", "club.owner"],
    });

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

    const ticket = await repo.findOne({
      where: { id },
      relations: ["club", "club.owner"],
    });

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

export const updateTicket = async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  const updates = req.body;

  const ticketRepo = AppDataSource.getRepository(Ticket);
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

  if ('price' in updates && (typeof updates.price !== 'number' || updates.price < 0)) {
    res.status(400).json({ error: "Price must be a non-negative number" });
    return;
  }

  if ('name' in updates && typeof updates.name !== 'string') {
    res.status(400).json({ error: "Name must be a string" });
    return;
  }

  Object.assign(ticket, updates);
  await ticketRepo.save(ticket);

  res.json({ message: "Ticket updated successfully", ticket });
};

export const getTicketsForMyClub = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Forbidden: Only clubowners can access this" });
      return;
    }

    const clubRepo = AppDataSource.getRepository(Club);
    const ticketRepo = AppDataSource.getRepository(Ticket);

    const club = await clubRepo.findOne({
      where: { ownerId: user.id },
    });

    if (!club) {
      console.error("❌ No club found for user:", user.id);
      res.status(404).json({ error: "Club not found for this user" });
      return;
    }

    const tickets = await ticketRepo.find({
      where: { club: { id: club.id } },
      order: { priority: "ASC" },
    });

    res.json(tickets);
  } catch (error) {
    console.error("❌ Error fetching my club's tickets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
