import { Request, Response } from "express";
import { AppDataSource } from "../../config/data-source";
import { Event } from "../../entities/Event";
import { Ticket } from "../../entities/Ticket";
import { AuthenticatedRequest } from "../../types/express";
import { validateImageUrlWithResponse } from "../../utils/validateImageUrl";
import { sanitizeInput, sanitizeObject } from "../../utils/sanitizeInput";

// Admin function to get events by club ID
export const getEventsByClubIdAdmin = async (req: Request, res: Response) => {
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
    console.error("❌ Failed to fetch events for club:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to create event for a specific club
export const createEventAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { clubId } = req.params;
    
    // Sanitize all string inputs
    const sanitizedBody = sanitizeObject(req.body, [
      'name', 'description'
    ], { maxLength: 1000 });
    
    const { name, description, availableDate, openHours } = sanitizedBody;

    if (!name || !availableDate || !openHours) {
      res.status(400).json({ error: "Missing required fields: name, availableDate, or openHours" });
      return;
    }

    // Validate image
    if (!req.file) {
      res.status(400).json({ error: "Image file is required." });
      return;
    }

    // Parse and validate openHours (required)
    let parsedOpenHours = null;
    if (typeof openHours === 'string') {
      try {
        parsedOpenHours = JSON.parse(openHours);
      } catch (error) {
        res.status(400).json({ error: "Invalid openHours format. Must be valid JSON." });
        return;
      }
    } else if (typeof openHours === 'object') {
      parsedOpenHours = openHours;
    } else {
      res.status(400).json({ error: "openHours is required and must be provided" });
      return;
    }

    // Validate openHours format
    if (!parsedOpenHours.open || !parsedOpenHours.close) {
      res.status(400).json({ error: "openHours must have both 'open' and 'close' properties" });
      return;
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(parsedOpenHours.open) || !timeRegex.test(parsedOpenHours.close)) {
      res.status(400).json({ error: "Time format must be HH:MM (e.g., '22:00', '02:00')" });
      return;
    }

    // Normalize date
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
    const processed = await (await import("../../services/imageService")).ImageService.processImage(req.file.buffer);

    const eventRepo = AppDataSource.getRepository(Event);
    const newEvent = eventRepo.create({
      name: name.trim(),
      description: description?.trim() || null,
      availableDate: normalizedDate,
      openHours: parsedOpenHours,
      bannerUrl: "", // will be set after upload
      BannerURLBlurHash: processed.blurhash,
      clubId: clubId,
    });

    await eventRepo.save(newEvent);

    // Upload image to S3
    const { S3Service } = await import("../../services/s3Service");
    const key = S3Service.generateKey(clubId, 'event-banner', `${newEvent.id}-${Date.now()}`);
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

// Admin function to update event
export const updateEventAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id;
    const eventRepo = AppDataSource.getRepository(Event);

    const event = await eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    // Sanitize inputs
    const sanitizedBody = sanitizeObject(req.body, [
      'name', 'description'
    ], { maxLength: 1000 });

    const { name, description, availableDate, openHours } = sanitizedBody;

    if (name !== undefined) event.name = name.trim();
    if (description !== undefined) event.description = description?.trim() || null;
    
    // Prevent changing availableDate
    if (availableDate !== undefined) {
      res.status(400).json({ error: "Cannot update availableDate after creation" });
      return;
    }
    
    if (openHours !== undefined) {
      let parsedOpenHours = null;
      if (openHours) {
        if (typeof openHours === 'string') {
          try {
            parsedOpenHours = JSON.parse(openHours);
          } catch (error) {
            res.status(400).json({ error: "Invalid openHours format. Must be valid JSON." });
            return;
          }
        } else if (typeof openHours === 'object') {
          parsedOpenHours = openHours;
        }

        // Validate openHours format
        if (parsedOpenHours) {
          if (!parsedOpenHours.open || !parsedOpenHours.close) {
            res.status(400).json({ error: "openHours must have both 'open' and 'close' properties" });
            return;
          }

          // Validate time format (HH:MM)
          const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(parsedOpenHours.open) || !timeRegex.test(parsedOpenHours.close)) {
            res.status(400).json({ error: "Time format must be HH:MM (e.g., '22:00', '02:00')" });
            return;
          }
        }
      }
      event.openHours = parsedOpenHours;
    }

    await eventRepo.save(event);
    res.status(200).json(event);
  } catch (err) {
    console.error("❌ Failed to update event:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to update event image
export const updateEventImageAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id;
    const eventRepo = AppDataSource.getRepository(Event);

    if (!req.file) {
      res.status(400).json({ error: "Image file is required" });
      return;
    }

    const event = await eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    // Process new image
    const processed = await (await import("../../services/imageService")).ImageService.processImage(req.file.buffer);

    // Store reference to old image for deletion
    const oldBannerUrl = event.bannerUrl;

    // Generate new S3 key with unique identifier
    const { S3Service } = await import("../../services/s3Service");
    const key = S3Service.generateKey(event.clubId, 'event-banner', `${event.id}-${Date.now()}`);

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

    res.status(200).json({ bannerUrl: event.bannerUrl });
  } catch (err) {
    console.error("❌ Failed to update event image:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to toggle event visibility
export const toggleEventVisibilityAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id;
    const eventRepo = AppDataSource.getRepository(Event);
    const ticketRepo = AppDataSource.getRepository(Ticket);

    const event = await eventRepo.findOne({ 
      where: { id: eventId },
      relations: ["tickets"]
    });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    // Toggle event visibility
    event.isActive = !event.isActive;
    await eventRepo.save(event);

    // Toggle visibility for all child tickets
    let updatedTickets = 0;
    if (event.tickets && event.tickets.length > 0) {
      for (const ticket of event.tickets) {
        ticket.isActive = event.isActive;
        await ticketRepo.save(ticket);
        updatedTickets++;
      }
    }

    res.status(200).json({ 
      message: "Event and all child tickets visibility toggled",
      isActive: event.isActive,
      ticketsUpdated: updatedTickets
    });
  } catch (err) {
    console.error("❌ Failed to toggle event visibility:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};



// Admin function to delete event
export const deleteEventAdmin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const eventId = req.params.id;
    const eventRepo = AppDataSource.getRepository(Event);

    const event = await eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    await eventRepo.remove(event);
    res.status(200).json({ message: "Event deleted successfully" });
  } catch (err) {
    console.error("❌ Failed to delete event:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}; 