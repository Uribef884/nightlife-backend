import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { TicketIncludedMenuItem } from "../entities/TicketIncludedMenuItem";
import { Ticket } from "../entities/Ticket";
import { MenuItem } from "../entities/MenuItem";
import { MenuItemVariant } from "../entities/MenuItemVariant";
import { AuthenticatedRequest } from "../types/express";

export async function getTicketIncludedMenuItems(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { ticketId } = req.params;

    if (!ticketId) {
      res.status(400).json({ error: "Ticket ID is required" });
      return;
    }

    const ticketIncludedMenuItemRepo = AppDataSource.getRepository(TicketIncludedMenuItem);
    const includedItems = await ticketIncludedMenuItemRepo.find({
      where: { ticketId },
      relations: ["menuItem", "variant"]
    });

    const formattedItems = includedItems.map(item => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItem.name,
      variantId: item.variantId,
      variantName: item.variant?.name || null,
      quantity: item.quantity
    }));

    res.json(formattedItems);
  } catch (error) {
    console.error("❌ Error getting ticket included menu items:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function addTicketIncludedMenuItem(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { ticketId } = req.params;
    const { menuItemId, variantId, quantity } = req.body;

    if (!ticketId || !menuItemId || !quantity) {
      res.status(400).json({ error: "Ticket ID, menu item ID, and quantity are required" });
      return;
    }

    if (quantity <= 0) {
      res.status(400).json({ error: "Quantity must be greater than 0" });
      return;
    }

    if (quantity > 15) {
      res.status(400).json({ error: "Quantity of a single menu item in a bundle cannot exceed 15" });
      return;
    }

    // Verify ticket exists and belongs to the club owner
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const ticket = await ticketRepo.findOne({
      where: { id: ticketId, isDeleted: false },
      relations: ["club"]
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (ticket.club.ownerId !== req.user!.id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const ticketIncludedMenuItemRepo = AppDataSource.getRepository(TicketIncludedMenuItem);

    // Verify menu item exists and belongs to the same club
    const menuItemRepo = AppDataSource.getRepository(MenuItem);
    const menuItem = await menuItemRepo.findOne({
      where: { id: menuItemId, clubId: ticket.clubId }
    });

    if (!menuItem) {
      res.status(404).json({ error: "Menu item not found or doesn't belong to this club" });
      return;
    }

    // If variant is specified, verify it exists
    if (variantId) {
      const variantRepo = AppDataSource.getRepository(MenuItemVariant);
      const variant = await variantRepo.findOne({
        where: { id: variantId, menuItemId }
      });

      if (!variant) {
        res.status(404).json({ error: "Menu item variant not found" });
        return;
      }
    }

    // Check if this combination already exists
    const existing = await ticketIncludedMenuItemRepo.findOne({
      where: { ticketId, menuItemId, variantId: variantId || null }
    });

    if (existing) {
      res.status(400).json({ error: "Item already added to combo" });
      return;
    }

    const includedItem = ticketIncludedMenuItemRepo.create({
      ticketId,
      menuItemId,
      variantId: variantId || null,
      quantity
    });

    await ticketIncludedMenuItemRepo.save(includedItem);

    res.status(201).json({
      message: "Menu item added to ticket",
      item: {
        id: includedItem.id,
        menuItemId: includedItem.menuItemId,
        variantId: includedItem.variantId,
        quantity: includedItem.quantity
      }
    });
  } catch (error) {
    console.error("❌ Error adding ticket included menu item:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function removeTicketIncludedMenuItem(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { ticketId, itemId } = req.params;

    if (!ticketId || !itemId) {
      res.status(400).json({ error: "Ticket ID and item ID are required" });
      return;
    }

    // Verify ticket exists and belongs to the club owner
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const ticket = await ticketRepo.findOne({
      where: { id: ticketId, isDeleted: false },
      relations: ["club"]
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (ticket.club.ownerId !== req.user!.id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const ticketIncludedMenuItemRepo = AppDataSource.getRepository(TicketIncludedMenuItem);
    const item = await ticketIncludedMenuItemRepo.findOne({
      where: { id: itemId, ticketId }
    });

    if (!item) {
      res.status(404).json({ error: "Included menu item not found" });
      return;
    }

    await ticketIncludedMenuItemRepo.remove(item);

    res.json({ message: "Menu item removed from ticket" });
  } catch (error) {
    console.error("❌ Error removing ticket included menu item:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateTicketIncludedMenuItem(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { ticketId, itemId } = req.params;
    const { quantity } = req.body;

    if (!ticketId || !itemId || quantity === undefined) {
      res.status(400).json({ error: "Ticket ID, item ID, and quantity are required" });
      return;
    }

    if (quantity <= 0) {
      res.status(400).json({ error: "Quantity must be greater than 0" });
      return;
    }

    if (quantity > 15) {
      res.status(400).json({ error: "Quantity of a single menu item in a bundle cannot exceed 15" });
      return;
    }

    // Verify ticket exists and belongs to the club owner
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const ticket = await ticketRepo.findOne({
      where: { id: ticketId, isDeleted: false },
      relations: ["club"]
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (ticket.club.ownerId !== req.user!.id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const ticketIncludedMenuItemRepo = AppDataSource.getRepository(TicketIncludedMenuItem);
    const item = await ticketIncludedMenuItemRepo.findOne({
      where: { id: itemId, ticketId }
    });

    if (!item) {
      res.status(404).json({ error: "Included menu item not found" });
      return;
    }

    item.quantity = quantity;
    await ticketIncludedMenuItemRepo.save(item);

    res.json({
      message: "Menu item quantity updated",
      item: {
        id: item.id,
        menuItemId: item.menuItemId,
        variantId: item.variantId,
        quantity: item.quantity
      }
    });
  } catch (error) {
    console.error("❌ Error updating ticket included menu item:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} 