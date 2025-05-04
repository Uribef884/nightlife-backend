import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Ticket } from "../entities/Ticket";
import { Club } from "../entities/Club";

export async function createTicket(req: Request, res: Response): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(Ticket);
    const clubRepo = AppDataSource.getRepository(Club);

    const {
      clubId,
      name,
      description,
      price,
      maxPerPerson,
      priority,
      isActive,
      availableDates,
    } = req.body;

    if (!clubId || !name || !price || !maxPerPerson || !priority) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const club = await clubRepo.findOneBy({ id: clubId });
    if (!club) {
      res.status(404).json({ error: "Club not found" });
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

  export async function getTicketById(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Ticket);
      const ticket = await repo.findOne({
        where: { id: req.params.id },
        relations: ["club"],
      });
  
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }
  
      res.json(ticket);
    } catch (error) {
      console.error("❌ Error fetching ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  export async function deleteTicket(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(Ticket);
  
      const ticket = await repo.findOneBy({ id });
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
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
      const { id } = req.params;
  
      const repo = AppDataSource.getRepository(Ticket);
      const ticket = await repo.findOne({ where: { id } });
  
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }
  
      ticket.isActive = !ticket.isActive; // just toggle it
      await repo.save(ticket);
  
      res.json({ message: "Ticket visibility toggled", isActive: ticket.isActive });
    } catch (error) {
      console.error("❌ Error toggling ticket visibility:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  export const updateTicket = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const updates = req.body;
  
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const ticket = await ticketRepo.findOne({ where: { id } });
  
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
  
    if ('price' in updates && (typeof updates.price !== 'number' || updates.price < 0)) {
      res.status(400).json({ error: "Price is required and must be a non-negative number" });
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
  