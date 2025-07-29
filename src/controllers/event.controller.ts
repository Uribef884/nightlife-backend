import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Event } from "../entities/Event";
import { AuthenticatedRequest } from "../types/express";
import { Ticket } from "../entities/Ticket";
import { TicketIncludedMenuItem } from "../entities/TicketIncludedMenuItem";
import { computeDynamicPrice, computeDynamicEventPrice, getEventTicketDynamicPricingReason } from "../utils/dynamicPricing";

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
    const ticketIncludedMenuRepo = AppDataSource.getRepository(TicketIncludedMenuItem);
    
    const events = await eventRepo.find({
      where: { clubId },
      relations: ["club", "tickets"],
      order: { availableDate: "ASC", createdAt: "DESC" }
    });
    
    // Apply dynamic pricing to event tickets and fetch included menu items
    const eventsWithDynamicPricing = await Promise.all(events.map(async event => {
      if (event.tickets && event.tickets.length > 0) {
        const ticketsWithDynamic = await Promise.all(event.tickets.map(async ticket => {
          let dynamicPrice = ticket.price;
          
          if (ticket.dynamicPricingEnabled && event.club) {
            // For events, we want to use the event's date and open hours
            // The event date + open hours becomes our "open time" reference
            if (event.openHours && event.openHours.open && event.openHours.close) {
              // Create a date object for when the event opens
              // Parse the event date properly to avoid timezone issues
              let eventDate: Date;
              
              // Handle availableDate which can be Date or string from database
              if (event.availableDate instanceof Date) {
                eventDate = new Date(event.availableDate);
              } else if (typeof event.availableDate === 'string') {
                // If it's a date string like "2025-07-25", parse it as local date
                const dateStr = event.availableDate as string;
                const [year, month, day] = dateStr.split('-').map(Number);
                eventDate = new Date(year, month - 1, day); // month is 0-indexed
              } else {
                // Fallback
                eventDate = new Date(event.availableDate);
              }
              
              // Use the exact same logic as the frontend (ticket controller)
              dynamicPrice = computeDynamicEventPrice(Number(ticket.price), new Date(event.availableDate), event.openHours);
              
              // Check if event has passed grace period
              if (dynamicPrice === -1) {
                // For event display, we'll show the ticket as unavailable instead of blocking
                dynamicPrice = 0; // Set to 0 to indicate unavailable
              }
            } else {
              // Fallback to club's open hours if event doesn't have specific hours
              dynamicPrice = computeDynamicEventPrice(Number(ticket.price), new Date(event.availableDate), event.openHours);
              
              // Check if event has passed grace period
              if (dynamicPrice === -1) {
                // For event display, we'll show the ticket as unavailable instead of blocking
                dynamicPrice = 0; // Set to 0 to indicate unavailable
              }
            }
          }
          
          // Fetch included menu items if this ticket includes them
          let includedMenuItems: Array<{
            id: string;
            menuItemId: string;
            menuItemName: string;
            variantId?: string;
            variantName: string | null;
            quantity: number;
          }> = [];
          
          if (ticket.includesMenuItem) {
            const includedItems = await ticketIncludedMenuRepo.find({
              where: { ticketId: ticket.id },
              relations: ["menuItem", "variant"]
            });
            
            includedMenuItems = includedItems.map(item => ({
              id: item.id,
              menuItemId: item.menuItemId,
              menuItemName: item.menuItem?.name || 'Unknown Item',
              variantId: item.variantId,
              variantName: item.variant?.name || null,
              quantity: item.quantity
            }));
          }
          
          return {
            ...ticket,
            dynamicPrice,
            includedMenuItems,
          };
        }));
        return {
          ...event,
          tickets: ticketsWithDynamic,
        };
      }
      return event;
    }));
    
    res.status(200).json(eventsWithDynamicPricing);
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
    const { name, description, availableDate, openHours } = req.body;
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

    // Parse openHours if provided
    let parsedOpenHours = null;
    if (openHours && typeof openHours === 'string') {
      try {
        parsedOpenHours = JSON.parse(openHours);
      } catch (error) {
        res.status(400).json({ error: "Invalid openHours format. Must be valid JSON." });
        return;
      }
    } else if (openHours && typeof openHours === 'object') {
      parsedOpenHours = openHours;
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
      openHours: parsedOpenHours,
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
    let hasPurchases = false;
    let ticketIds: string[] = [];
    if (event.tickets && event.tickets.length > 0) {
      const { TicketPurchase } = await import("../entities/TicketPurchase");
      const purchaseRepo = AppDataSource.getRepository(TicketPurchase);
      ticketIds = event.tickets.map(ticket => ticket.id);
      const existingPurchases = await purchaseRepo
        .createQueryBuilder("purchase")
        .where("purchase.ticketId IN (:...ticketIds)", { ticketIds })
        .getCount();
      hasPurchases = existingPurchases > 0;
    }

    const bannerUrl = event.bannerUrl;
    const ticketRepo = AppDataSource.getRepository(Ticket);

    if (hasPurchases) {
      // Soft delete event
      event.isDeleted = true;
      event.deletedAt = new Date();
      event.isActive = false;
      await eventRepo.save(event);
      // Soft delete all related tickets
      if (event.tickets && event.tickets.length > 0) {
        for (const ticket of event.tickets) {
          ticket.isDeleted = true;
          ticket.deletedAt = new Date();
          ticket.isActive = false;
          await ticketRepo.save(ticket);
        }
      }
      res.status(200).json({ message: "Event and related tickets soft deleted due to existing purchases" });
      return;
    }

    // Hard delete (no purchases)
    await eventRepo.remove(event);

    // Delete banner from S3 if it exists
    if (bannerUrl) {
      try {
        const { S3Service } = await import("../services/s3Service");
        const url = new URL(bannerUrl);
        const key = url.pathname.substring(1);
        await S3Service.deleteFile(key);
      } catch (deleteError) {
        console.error('⚠️ Warning: Failed to delete event banner from S3:', deleteError);
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
    const { name, description, availableDate, openHours } = req.body;
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

    // Parse openHours if provided
    if (openHours !== undefined) {
      let parsedOpenHours = null;
      if (openHours && typeof openHours === 'string') {
        try {
          parsedOpenHours = JSON.parse(openHours);
        } catch (error) {
          res.status(400).json({ error: "Invalid openHours format. Must be valid JSON." });
          return;
        }
      } else if (openHours && typeof openHours === 'object') {
        parsedOpenHours = openHours;
      }
      event.openHours = parsedOpenHours;
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
