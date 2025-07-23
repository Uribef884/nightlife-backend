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
      relations: ["club", "tickets"],
      order: { availableDate: "ASC", createdAt: "DESC" }
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
    const { name, description, availableDate } = req.body;
    const user = req.user;

    if (!user || !user.clubId) {
      res.status(403).json({ error: "Forbidden: No clubId associated" });
      return;
    }

    if (!name || !availableDate) {
      res.status(400).json({ error: "Missing required fields: name or availableDate" });
      return;
    }

    // Validate image
    if (!req.file) {
      res.status(400).json({ error: "Image file is required." });
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

    // Process image
    const processed = await (await import("../services/imageService")).ImageService.processImage(req.file.buffer);

    const eventRepo = AppDataSource.getRepository(Event);
    const newEvent = eventRepo.create({
      name: name.trim(),
      description: description?.trim() || null,
      availableDate: normalizedDate,
      bannerUrl: "", // will be set after upload
      BannerURLBlurHash: processed.blurhash,
      clubId: user.clubId,
    });

    await eventRepo.save(newEvent);

    // Upload image to S3
    const { S3Service } = await import("../services/s3Service");
    const key = S3Service.generateKey(user.clubId, 'event-banner');
    const uploadResult = await S3Service.uploadFile(processed.buffer, 'image/jpeg', key);
    
    // Update event with banner URL
    newEvent.bannerUrl = uploadResult.url;
    await eventRepo.save(newEvent);

    res.status(201).json(newEvent);
  } catch (err) {
    console.error("❌ Failed to create event:", err);
    res.status(500).json({ error: "Internal server error" });
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
        // Parse the S3 URL to extract the key
        const url = new URL(bannerUrl);
        const key = url.pathname.substring(1); // Remove leading slash
        
        await S3Service.deleteFile(key);
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

// PUT /events/:id — update name and description
export const updateEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, availableDate } = req.body;
    const user = req.user;

    if (!user || !user.clubId) {
      res.status(403).json({ error: "Forbidden: No clubId associated" });
      return;
    }

    // Prevent changing availableDate
    if (availableDate !== undefined) {
      res.status(400).json({ error: "Cannot update availableDate after creation" });
      return;
    }

    const eventRepo = AppDataSource.getRepository(Event);
    const event = await eventRepo.findOne({ where: { id } });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (event.clubId !== user.clubId) {
      res.status(403).json({ error: "Forbidden: You cannot update events from another club" });
      return;
    }

    // Update fields
    if (name !== undefined) {
      event.name = name.trim();
    }
    if (description !== undefined) {
      event.description = description?.trim() || null;
    }

    await eventRepo.save(event);
    res.json(event);
  } catch (err) {
    console.error("❌ Failed to update event:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PUT /events/:id/image — update event image
export const updateEventImage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user || !user.clubId) {
      res.status(403).json({ error: "Forbidden: No clubId associated" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "Image file is required." });
      return;
    }

    const eventRepo = AppDataSource.getRepository(Event);
    const event = await eventRepo.findOne({ where: { id } });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (event.clubId !== user.clubId) {
      res.status(403).json({ error: "Forbidden: You cannot update events from another club" });
      return;
    }

    // Process new image
    const processed = await (await import("../services/imageService")).ImageService.processImage(req.file.buffer);

    // Store reference to old image for deletion
    const oldBannerUrl = event.bannerUrl;

    // Generate new S3 key with unique identifier
    const { S3Service } = await import("../services/s3Service");
    const key = S3Service.generateKey(user.clubId, 'event-banner', `${event.id}-${Date.now()}`);

    // Upload new image
    const uploadResult = await S3Service.uploadFile(processed.buffer, 'image/jpeg', key);

    // Update event
    event.bannerUrl = uploadResult.url;
    event.BannerURLBlurHash = processed.blurhash;
    await eventRepo.save(event);

    // Delete old image from S3 if it exists and is different
    if (oldBannerUrl && oldBannerUrl !== uploadResult.url) {
      try {
        const url = new URL(oldBannerUrl);
        const oldKey = url.pathname.substring(1);
        await S3Service.deleteFile(oldKey);
      } catch (deleteError) {
        console.error('⚠️ Warning: Failed to delete old event banner from S3:', deleteError);
        // Don't fail the request - new image is already uploaded
      }
    }

    res.json(event);
  } catch (err) {
    console.error("❌ Failed to update event image:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PUT /events/:id/toggle-visibility — toggle event visibility
export const toggleEventVisibility = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const eventRepo = AppDataSource.getRepository(Event);
    const event = await eventRepo.findOne({ where: { id } });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (event.clubId !== user.clubId) {
      res.status(403).json({ error: "You are not authorized to modify this event" });
      return;
    }

    event.isActive = !event.isActive;
    await eventRepo.save(event);

    res.json({ message: "Event visibility toggled", isActive: event.isActive });
  } catch (err) {
    console.error("❌ Failed to toggle event visibility:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
