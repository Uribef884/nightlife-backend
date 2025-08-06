import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Ticket } from "../entities/Ticket";
import { Club } from "../entities/Club";
import { AuthenticatedRequest } from "../types/express";
import { TicketPurchase } from "../entities/TicketPurchase"; 
import { Event } from "../entities/Event";
import { TicketCategory } from "../entities/Ticket";
import { TicketIncludedMenuItem } from "../entities/TicketIncludedMenuItem";
import { MenuItem } from "../entities/MenuItem";
import { MenuItemVariant } from "../entities/MenuItemVariant";
import { computeDynamicPrice, computeDynamicEventPrice, getEventTicketDynamicPricingReason } from "../utils/dynamicPricing";
import { sanitizeInput, sanitizeObject } from "../utils/sanitizeInput";
import { MoreThanOrEqual, IsNull } from "typeorm";

// Utility function to get today's date in a timezone-safe way
const getTodayDate = (): Date => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

// CREATE TICKET
export async function createTicket(req: Request, res: Response): Promise<void> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      await queryRunner.rollbackTransaction();
      return;
    }

    // Sanitize all string inputs
    const sanitizedBody = sanitizeObject(req.body, [
      'name', 'description', 'clubId'
    ], { maxLength: 500 });

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
      includesMenuItem,
      menuItems, // Array of menu items to include
    } = sanitizedBody;

    if (!name || price == null || maxPerPerson == null || priority == null || !category) {
      res.status(400).json({ error: "Missing required fields" });
      await queryRunner.rollbackTransaction();
      return;
    }

    if (price < 0 || maxPerPerson < 0 || priority < 1) {
      res.status(400).json({ error: "Invalid price, maxPerPerson, or priority" });
      await queryRunner.rollbackTransaction();
      return;
    }

    // Validate includesMenuItem and menuItems consistency
    if (includesMenuItem && (!menuItems || !Array.isArray(menuItems) || menuItems.length === 0)) {
      res.status(400).json({ 
        error: "When includesMenuItem is true, menuItems array must be provided with at least one item" 
      });
      await queryRunner.rollbackTransaction();
      return;
    }

    if (!includesMenuItem && menuItems && menuItems.length > 0) {
      res.status(400).json({ 
        error: "When includesMenuItem is false, menuItems should not be provided" 
      });
      await queryRunner.rollbackTransaction();
      return;
    }

    const clubRepo = queryRunner.manager.getRepository(Club);
    let club: Club | null = null;

    // 🔐 Admins must specify clubId
    if (user.role === "admin") {
      const { clubId } = req.body;
      if (!clubId) {
        res.status(400).json({ error: "Admin must specify clubId" });
        await queryRunner.rollbackTransaction();
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
      await queryRunner.rollbackTransaction();
      return;
    }

    // 📅 Normalize available date
    let parsedDate: Date | null = null;
    let event: Event | null = null;

    if (eventId) {
      const eventRepo = queryRunner.manager.getRepository(Event);
      event = await eventRepo.findOne({ where: { id: eventId }, relations: ["club"] });

      if (!event || event.clubId !== club.id) {
        res.status(404).json({ error: "Event not found or not owned by your club" });
        await queryRunner.rollbackTransaction();
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
        await queryRunner.rollbackTransaction();
        return;
      }
    }

    let dynamicPricing = false;
    if (category === TicketCategory.FREE || price == 0) {
      if (dynamicPricingEnabled) {
        res.status(400).json({ error: "Dynamic pricing cannot be enabled for free tickets. Free tickets must always have a fixed price of 0." });
        await queryRunner.rollbackTransaction();
        return;
      }
      dynamicPricing = false;
      
      // 🔒 Check if event exists for this date when creating free tickets
      if (availableDate && parsedDate) {
        const eventRepo = queryRunner.manager.getRepository(Event);
        const existingEvent = await eventRepo.findOne({
          where: { 
            clubId: club.id, 
            availableDate: parsedDate,
            isActive: true,
            isDeleted: false
          }
        });

        if (existingEvent) {
          res.status(400).json({ 
            error: `Cannot create free ticket for ${availableDate} because an event already exists for that date.` 
          });
          await queryRunner.rollbackTransaction();
          return;
        }
      }
    } else {
      dynamicPricing = !!dynamicPricingEnabled;
    }

    const ticketRepo = queryRunner.manager.getRepository(Ticket);
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
      includesMenuItem: includesMenuItem ?? false,
    });

    // Validate menu items before saving anything
    if (includesMenuItem && menuItems && menuItems.length > 0) {
      const ticketIncludedMenuItemRepo = queryRunner.manager.getRepository(TicketIncludedMenuItem);
      const menuItemRepo = queryRunner.manager.getRepository(MenuItem);
      const menuItemVariantRepo = queryRunner.manager.getRepository(MenuItemVariant);

      // Check for duplicates within the menuItems array
      const seenCombinations = new Set();
      const duplicates = [];

      for (const menuItem of menuItems) {
        const { menuItemId, variantId } = menuItem;
        const combination = `${menuItemId}-${variantId || 'null'}`;
        
        if (seenCombinations.has(combination)) {
          duplicates.push(combination);
        } else {
          seenCombinations.add(combination);
        }
      }

      if (duplicates.length > 0) {
        res.status(400).json({ 
          error: "Duplicate menu items found in the request. Each menu item can only be included once per ticket." 
        });
        await queryRunner.rollbackTransaction();
        return;
      }

      const menuItemRecords = [];

      for (const menuItem of menuItems) {
        const { menuItemId, variantId, quantity } = menuItem;

        if (!menuItemId || !quantity || quantity <= 0) {
          res.status(400).json({ 
            error: "Each menu item must have menuItemId and positive quantity" 
          });
          await queryRunner.rollbackTransaction();
          return;
        }

        // Verify menu item exists and belongs to the club
        const menuItemEntity = await menuItemRepo.findOne({
          where: { id: menuItemId, clubId: club.id, isDeleted: false }
        });

        if (!menuItemEntity) {
          res.status(400).json({ 
            error: `Menu item ${menuItemId} not found or not owned by your club` 
          });
          await queryRunner.rollbackTransaction();
          return;
        }

        // Check if menu item has variants
        const variants = await menuItemVariantRepo.find({
          where: { menuItemId, isActive: true, isDeleted: false }
        });

        if (variants.length > 0 && !variantId) {
          res.status(400).json({ 
            error: `Menu item ${menuItemEntity.name} has variants. Please specify a variantId` 
          });
          await queryRunner.rollbackTransaction();
          return;
        }

        if (variantId) {
          // Verify variant exists and belongs to the menu item
          const variant = await menuItemVariantRepo.findOne({
            where: { id: variantId, menuItemId, isActive: true, isDeleted: false }
          });

          if (!variant) {
            res.status(400).json({ 
              error: `Variant ${variantId} not found or not active for menu item ${menuItemEntity.name}` 
            });
            await queryRunner.rollbackTransaction();
            return;
          }
        }

        // Prepare the ticket included menu item record
        const ticketIncludedMenuItem = ticketIncludedMenuItemRepo.create({
          // ticketId will be set after ticket is saved
          menuItemId,
          variantId: variantId || undefined,
          quantity
        });

        menuItemRecords.push(ticketIncludedMenuItem);
      }

      // Save the ticket first
      const saved = await ticketRepo.save(ticket);

      // Now set ticketId and save menu item records
      for (const record of menuItemRecords) {
        record.ticketId = saved.id;
      }
      await queryRunner.manager.getRepository(TicketIncludedMenuItem).save(menuItemRecords);

      await queryRunner.commitTransaction();
      res.status(201).json(saved);
      return;
    } else {
      // No menu items, just save the ticket
      const saved = await ticketRepo.save(ticket);
      await queryRunner.commitTransaction();
      res.status(201).json(saved);
      return;
    }
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error("❌ Error creating ticket:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await queryRunner.release();
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
  
  // Sanitize all string inputs
  const sanitizedUpdates = sanitizeObject(req.body, [
    'name', 'description'
  ], { maxLength: 500 });
  
  const updates = sanitizedUpdates;

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

  // ❌ Prevent changing includesMenuItem flag
  if ("includesMenuItem" in updates && updates.includesMenuItem !== ticket.includesMenuItem) {
    res.status(400).json({
      error: "Cannot change includesMenuItem flag after ticket creation",
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
    const clubRepo = AppDataSource.getRepository(Club);
    const ticketIncludedMenuRepo = AppDataSource.getRepository(TicketIncludedMenuItem);
    
    // Filter out past tickets while keeping tickets with null availableDate
    const tickets = await repo.find({
      where: [
        { isActive: true, isDeleted: false, availableDate: IsNull() }, // Always show tickets with null date
        { isActive: true, isDeleted: false, availableDate: MoreThanOrEqual(getTodayDate()) } // Show future tickets
      ],
      relations: ["club", "event"],
      order: { priority: "ASC" },
    });
    
    const formatted = await Promise.all(tickets.map(async (t) => {
      const club = t.club || (await clubRepo.findOne({ where: { id: t.clubId } }));
      let dynamicPrice = t.price;
      if (t.dynamicPricingEnabled && club) {
        if (t.category === "event" && t.event) {
          // Event ticket - use event's date and openHours for dynamic pricing
          dynamicPrice = computeDynamicEventPrice(Number(t.price), new Date(t.event.availableDate), t.event.openHours);
          
          // Check if event has passed grace period
          if (dynamicPrice === -1) {
            // For ticket display, we'll show the ticket as unavailable instead of blocking
            dynamicPrice = 0; // Set to 0 to indicate unavailable
          }
        } else if (t.category === "event" && t.availableDate) {
          // Fallback: Event ticket without event relation - use ticket's availableDate
          dynamicPrice = computeDynamicEventPrice(Number(t.price), new Date(t.availableDate), undefined);
          
          // Check if event has passed grace period
          if (dynamicPrice === -1) {
            // For ticket display, we'll show the ticket as unavailable instead of blocking
            dynamicPrice = 0; // Set to 0 to indicate unavailable
          }
        } else {
          // General ticket - use time-based dynamic pricing
          dynamicPrice = computeDynamicPrice({
            basePrice: Number(t.price),
            clubOpenDays: club.openDays,
            openHours: club.openHours,
            availableDate: t.availableDate,
            useDateBasedLogic: false,
          });
        }
      } else if (t.category === "event") {
        // Grace period check for event tickets when dynamic pricing is disabled
        if (t.event) {
          const gracePeriodCheck = computeDynamicEventPrice(Number(t.price), new Date(t.event.availableDate), t.event.openHours);
          if (gracePeriodCheck === -1) {
            // For ticket display, we'll show the ticket as unavailable instead of blocking
            dynamicPrice = 0; // Set to 0 to indicate unavailable
          } else if (gracePeriodCheck > Number(t.price)) {
            // If grace period price is higher than base price, use grace period price
            dynamicPrice = gracePeriodCheck;
          }
        } else if (t.availableDate) {
          const eventDate = new Date(t.availableDate);
          const gracePeriodCheck = computeDynamicEventPrice(Number(t.price), eventDate);
          if (gracePeriodCheck === -1) {
            // For ticket display, we'll show the ticket as unavailable instead of blocking
            dynamicPrice = 0; // Set to 0 to indicate unavailable
          } else if (gracePeriodCheck > Number(t.price)) {
            // If grace period price is higher than base price, use grace period price
            dynamicPrice = gracePeriodCheck;
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
      
      if (t.includesMenuItem) {
        const includedItems = await ticketIncludedMenuRepo.find({
          where: { ticketId: t.id },
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
        ...t,
        soldOut: t.quantity !== null && t.quantity === 0,
        dynamicPrice,
        includedMenuItems,
      };
    }));
    
    // 🔒 Filter out free tickets when events exist for the same date
    const filteredTickets = await Promise.all(formatted.map(async (ticket) => {
      if (ticket.category === "free" && ticket.availableDate) {
        // Check if an event exists for this date
        const eventRepo = AppDataSource.getRepository(Event);
        const existingEvent = await eventRepo.findOne({
          where: { 
            clubId: ticket.clubId, 
            availableDate: ticket.availableDate,
            isActive: true,
            isDeleted: false
          }
        });
        
        // Hide free ticket if event exists for same date
        if (existingEvent) {
          return null;
        }
      }
      return ticket;
    }));
    
    // Remove null entries (hidden tickets)
    const visibleTickets = filteredTickets.filter(ticket => ticket !== null);
    
    // Count hidden free tickets for club owners
    let hiddenFreeTicketsCount = 0;
    let hiddenFreeTicketsMessage = null;
    
    if (req.user?.role === "clubowner" || req.user?.role === "admin") {
      hiddenFreeTicketsCount = formatted.length - visibleTickets.length;
      if (hiddenFreeTicketsCount > 0) {
        hiddenFreeTicketsMessage = `${hiddenFreeTicketsCount} free ticket(s) hidden because events exist for the same date(s).`;
      }
    }
    
    const response: any = { tickets: visibleTickets };
    if (hiddenFreeTicketsMessage) {
      response.message = hiddenFreeTicketsMessage;
    }
    
    res.json(response);
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
    const clubRepo = AppDataSource.getRepository(Club);
    const ticketIncludedMenuRepo = AppDataSource.getRepository(TicketIncludedMenuItem);
    
    // Filter out past tickets while keeping tickets with null availableDate
    const tickets = await repo.find({
      where: [
        { club: { id }, isActive: true, isDeleted: false, availableDate: IsNull() }, // Always show tickets with null date
        { club: { id }, isActive: true, isDeleted: false, availableDate: MoreThanOrEqual(getTodayDate()) } // Show future tickets
      ],
      order: { priority: "ASC" },
      relations: ["club", "event"],
    });
    
    const formatted = await Promise.all(tickets.map(async (t) => {
      const club = t.club || (await clubRepo.findOne({ where: { id: t.clubId } }));
      let dynamicPrice = t.price;
      if (t.dynamicPricingEnabled && club) {
        if (t.category === "event" && t.event) {
          // Event ticket - use event's date and openHours for dynamic pricing
          dynamicPrice = computeDynamicEventPrice(Number(t.price), new Date(t.event.availableDate), t.event.openHours);
          
          // Check if event has passed grace period
          if (dynamicPrice === -1) {
            // For ticket display, we'll show the ticket as unavailable instead of blocking
            dynamicPrice = 0; // Set to 0 to indicate unavailable
          }
        } else if (t.category === "event" && t.availableDate) {
          // Fallback: Event ticket without event relation - use ticket's availableDate
          dynamicPrice = computeDynamicEventPrice(Number(t.price), new Date(t.availableDate));
          
          // Check if event has passed grace period
          if (dynamicPrice === -1) {
            // For ticket display, we'll show the ticket as unavailable instead of blocking
            dynamicPrice = 0; // Set to 0 to indicate unavailable
          }
        } else {
          // General ticket - use time-based dynamic pricing
          dynamicPrice = computeDynamicPrice({
            basePrice: Number(t.price),
            clubOpenDays: club.openDays,
            openHours: club.openHours,
            availableDate: t.availableDate,
            useDateBasedLogic: false,
          });
        }
      } else if (t.category === "event") {
        // Grace period check for event tickets when dynamic pricing is disabled
        if (t.event) {
          const gracePeriodCheck = computeDynamicEventPrice(Number(t.price), new Date(t.event.availableDate), t.event.openHours);
          if (gracePeriodCheck === -1) {
            // For ticket display, we'll show the ticket as unavailable instead of blocking
            dynamicPrice = 0; // Set to 0 to indicate unavailable
          } else if (gracePeriodCheck > Number(t.price)) {
            // If grace period price is higher than base price, use grace period price
            dynamicPrice = gracePeriodCheck;
          }
        } else if (t.availableDate) {
          const eventDate = new Date(t.availableDate);
          const gracePeriodCheck = computeDynamicEventPrice(Number(t.price), eventDate);
          if (gracePeriodCheck === -1) {
            // For ticket display, we'll show the ticket as unavailable instead of blocking
            dynamicPrice = 0; // Set to 0 to indicate unavailable
          } else if (gracePeriodCheck > Number(t.price)) {
            // If grace period price is higher than base price, use grace period price
            dynamicPrice = gracePeriodCheck;
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
      
      if (t.includesMenuItem) {
        const includedItems = await ticketIncludedMenuRepo.find({
          where: { ticketId: t.id },
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
        ...t,
        soldOut: t.quantity !== null && t.quantity === 0,
        dynamicPrice,
        includedMenuItems,
      };
    }));
    
    // 🔒 Filter out free tickets when events exist for the same date
    const filteredTickets = await Promise.all(formatted.map(async (ticket) => {
      if (ticket.category === "free" && ticket.availableDate) {
        // Check if an event exists for this date
        const eventRepo = AppDataSource.getRepository(Event);
        const existingEvent = await eventRepo.findOne({
          where: { 
            clubId: ticket.clubId, 
            availableDate: ticket.availableDate,
            isActive: true,
            isDeleted: false
          }
        });
        
        // Hide free ticket if event exists for same date
        if (existingEvent) {
          return null;
        }
      }
      return ticket;
    }));
    
    // Remove null entries (hidden tickets)
    const visibleTickets = filteredTickets.filter(ticket => ticket !== null);
    
    // Count hidden free tickets for club owners
    let hiddenFreeTicketsCount = 0;
    let hiddenFreeTicketsMessage = null;
    
    if (req.user?.role === "clubowner" || req.user?.role === "admin") {
      hiddenFreeTicketsCount = formatted.length - visibleTickets.length;
      if (hiddenFreeTicketsCount > 0) {
        hiddenFreeTicketsMessage = `${hiddenFreeTicketsCount} free ticket(s) hidden because events exist for the same date(s).`;
      }
    }
    
    const response: any = { tickets: visibleTickets };
    if (hiddenFreeTicketsMessage) {
      response.message = hiddenFreeTicketsMessage;
    }
    
    res.json(response);
  } catch (error) {
    console.error("❌ Error fetching tickets:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ✅ GET TICKET BY ID
export async function getTicketById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const clubRepo = AppDataSource.getRepository(Club);
    const { id } = req.params;
    
    // Build where clause based on authentication status
    let whereClause: any = { id, isDeleted: false };
    
    // If no user (public access), only show active tickets
    if (!user) {
      whereClause.isActive = true;
    }
    
    const ticket = await ticketRepo.findOne({ 
      where: whereClause, 
      relations: ["club"] 
    });
    
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    
    // If user is authenticated and is a clubowner, check ownership
    if (user && user.role === "clubowner" && ticket.club.ownerId !== user.id) {
      res.status(403).json({ error: "Forbidden: This ticket doesn't belong to your club" });
      return;
    }
    const club = ticket.club || (await clubRepo.findOne({ where: { id: ticket.clubId } }));
    let dynamicPrice = ticket.price;
    if (ticket.dynamicPricingEnabled && club) {
      dynamicPrice = computeDynamicPrice({
        basePrice: Number(ticket.price),
        clubOpenDays: club.openDays,
        openHours: club.openHours,
        availableDate: ticket.availableDate,
        useDateBasedLogic: ticket.category === "event",
      });
    }
    const response = {
      ...ticket,
      soldOut: ticket.quantity !== null && ticket.quantity === 0,
      dynamicPrice,
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
      where: { club: { id: club.id }, isDeleted: false },
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
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const purchaseRepo = AppDataSource.getRepository(TicketPurchase);
    
    const ticket = await ticketRepo.findOne({ 
      where: { id }, 
      relations: ["club", "club.owner"] 
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (user.role === "clubowner" && ticket.club.ownerId !== user.id) {
      res.status(403).json({ error: "You are not authorized to delete this ticket" });
      return;
    }

    // Check if there are associated purchases
    const associatedPurchases = await purchaseRepo.count({ where: { ticketId: id } });

    if (associatedPurchases > 0) {
      // Soft delete - mark as deleted but keep the record
      ticket.isDeleted = true;
      ticket.deletedAt = new Date();
      ticket.isActive = false; // Also deactivate to prevent new purchases
      await ticketRepo.save(ticket);
      
      res.json({ 
        message: "Ticket soft deleted successfully", 
        deletedAt: ticket.deletedAt,
        associatedPurchases,
        note: "Ticket marked as deleted but preserved due to existing purchases"
      });
    } else {
      // Hard delete - no associated purchases, safe to completely remove
      await ticketRepo.remove(ticket);
      res.json({ 
        message: "Ticket permanently deleted successfully",
        note: "No associated purchases found, ticket completely removed"
      });
    }
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
    if ((ticket.category === TicketCategory.FREE || ticket.price === 0)) {
      if (!ticket.dynamicPricingEnabled) {
        // Don't allow enabling dynamic pricing for free tickets
        res.status(400).json({ error: "Dynamic pricing cannot be enabled for free tickets. Free tickets must always have a fixed price of 0." });
        return;
      } else {
        // Allow disabling if currently enabled (shouldn't happen, but for safety)
        ticket.dynamicPricingEnabled = false;
        await repo.save(ticket);
        res.json({ message: "Dynamic pricing has been disabled for this free ticket. Free tickets must always have a fixed price of 0.", dynamicPricingEnabled: ticket.dynamicPricingEnabled });
        return;
      }
    }

    // For paid tickets, allow normal toggle
    ticket.dynamicPricingEnabled = !ticket.dynamicPricingEnabled;
    await repo.save(ticket);

    res.json({ message: "Ticket dynamic pricing toggled", dynamicPricingEnabled: ticket.dynamicPricingEnabled });
  } catch (error) {
    console.error("❌ Error toggling ticket dynamic pricing:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
