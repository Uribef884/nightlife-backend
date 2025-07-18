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

// GET /events/my-club — club owner only
export const getMyClubEvents = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    // Only club owners can access their club's events
    if (user.role !== "admin" && user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can access club events" });
      return;
    }

    // For non-admin users, they must have a clubId
    if (user.role !== "admin" && !user.clubId) {
      res.status(400).json({ error: "User is not associated with any club" });
      return;
    }

    const clubId = user.clubId!;
    const eventRepo = AppDataSource.getRepository(Event);
    
    const events = await eventRepo.find({
      where: { clubId },
      relations: ["club", "tickets"],
      order: { availableDate: "ASC", createdAt: "DESC" }
    });

    // Add some useful metadata for each event
    const enrichedEvents = events.map(event => ({
      ...event,
      ticketCount: event.tickets?.length || 0,
      hasActiveTickets: event.tickets?.some(ticket => ticket.isActive) || false
    }));

    res.status(200).json(enrichedEvents);
  } catch (err) {
    console.error("❌ Failed to fetch club events:", err);
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
    const event = await eventRepo.findOne({ 
      where: { id: eventId },
      relations: ["tickets"]
    });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (event.clubId !== user.clubId) {
      res.status(403).json({ error: "Forbidden: You cannot delete events from another club" });
      return;
    }

    // Check if event has purchased tickets
    if (event.tickets && event.tickets.length > 0) {
      // Check if any tickets have been purchased
      const { TicketPurchase } = await import("../entities/TicketPurchase");
      const purchaseRepo = AppDataSource.getRepository(TicketPurchase);
      
      const ticketIds = event.tickets.map(ticket => ticket.id);
      const existingPurchases = await purchaseRepo
        .createQueryBuilder("purchase")
        .where("purchase.ticketId IN (:...ticketIds)", { ticketIds })
        .getCount();

      if (existingPurchases > 0) {
        res.status(400).json({ 
          error: "Cannot delete event with purchased tickets. Please contact support if you need to cancel this event." 
        });
        return;
      }
    }

    // Store reference to banner for S3 cleanup
    const bannerUrl = event.bannerUrl;

    // Delete the event (this will CASCADE delete tickets due to onDelete: "CASCADE")
    await eventRepo.remove(event);

    // Delete banner from S3 if it exists
    if (bannerUrl) {
      try {
        const { S3Service } = await import("../services/s3Service");
        const urlParts = bannerUrl.split('/');
        const key = urlParts.slice(3).join('/'); // Remove https://bucket.s3.region.amazonaws.com/
        await S3Service.deleteFile(key);
        console.log(`✅ Deleted event banner from S3: ${key}`);
      } catch (deleteError) {
        console.error('⚠️ Warning: Failed to delete event banner from S3:', deleteError);
        // Don't fail the request - event is already deleted
      }
    }

    res.status(200).json({ message: "Event and associated tickets deleted successfully" });
  } catch (err) {
    console.error("❌ Failed to delete event:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
