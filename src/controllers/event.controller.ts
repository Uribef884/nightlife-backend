import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Event } from "../entities/Event";
import { AuthenticatedRequest } from "../types/express";

// GET /events — public
export const getAllEvents = async (req: Request, res: Response) => {
  try {
    const eventRepo = AppDataSource.getRepository(Event);
    const events = await eventRepo.find({ relations: ["club"] });
    res.status(200).json(events);
  } catch (err) {
    console.error("❌ Failed to fetch all events:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /events/club/:clubId — public
export const getEventsByClubId = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    const eventRepo = AppDataSource.getRepository(Event);
    const events = await eventRepo.find({
      where: { clubId },
      relations: ["club"],
    });
    res.status(200).json(events);
  } catch (err) {
    console.error("❌ Failed to fetch events by club:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /events — clubOwner only
export const createEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
try {
    const { name, description, availableDate, bannerUrl, BannerURLBlurHash } = req.body;
    const user = req.user;

    if (!user || !user.clubId) {
     res.status(403).json({ error: "Forbidden: No clubId associated" });
     return; 
    }

    if (!name || !availableDate) {
      res.status(400).json({ error: "Missing required fields: name or availableDate" });
      return;
    }

    // 🔒 Normalize date using same pattern as checkout.ts
    const raw = typeof availableDate === "string" ? availableDate.split("T")[0] : availableDate;
    const [year, month, day] = raw.split("-").map(Number);

    if (!year || !month || !day) {
      res.status(400).json({ error: "Invalid availableDate format" });
      return;
    }

    const normalizedDate = new Date(year, month - 1, day);
    normalizedDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (normalizedDate < today) {
      res.status(400).json({ error: "Event date cannot be in the past" });
      return;
    }

    const eventRepo = AppDataSource.getRepository(Event);
    const newEvent = eventRepo.create({
      name: name.trim(),
      description: description?.trim() || null,
      availableDate: normalizedDate,
      bannerUrl: bannerUrl?.trim() || null,
      BannerURLBlurHash,
      clubId: user.clubId,
    });

    await eventRepo.save(newEvent);
    res.status(201).json(newEvent);
    return;
  } catch (err) {
    console.error("❌ Failed to create event:", err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
};

// DELETE /events/:id — clubOwner only
export const deleteEvent = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const eventId = req.params.id;
    const user = req.user;

    if (!user || !user.clubId) {
      res.status(403).json({ error: "Forbidden: No clubId associated" });
      return;
    }

    const eventRepo = AppDataSource.getRepository(Event);
    const event = await eventRepo.findOneBy({ id: eventId });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (event.clubId !== user.clubId) {
      res.status(403).json({ error: "Forbidden: You cannot delete events from another club" });
      return;
    }

    await eventRepo.remove(event);
    res.status(200).json({ message: "Event deleted successfully" });
  } catch (err) {
    console.error("❌ Failed to delete event:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
