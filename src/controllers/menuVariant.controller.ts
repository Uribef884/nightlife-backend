import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuItemVariant } from "../entities/MenuItemVariant";
import { MenuItem } from "../entities/MenuItem";
import { TicketIncludedMenuItem } from "../entities/TicketIncludedMenuItem";
import { MenuPurchase } from "../entities/MenuPurchase";
import { sanitizeInput } from "../utils/sanitizeInput";
import { AuthenticatedRequest } from "../types/express";
import { computeDynamicPrice } from "../utils/dynamicPricing";
import { Club } from "../entities/Club";

export const getVariantsByMenuItemId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { menuItemId } = req.params;
    const variantRepo = AppDataSource.getRepository(MenuItemVariant);
    const itemRepo = AppDataSource.getRepository(MenuItem);
    const clubRepo = AppDataSource.getRepository(Club);
    const variants = await variantRepo.find({
      where: { menuItemId, isActive: true, isDeleted: false },
      order: { name: "ASC" },
    });
    const menuItem = await itemRepo.findOne({ where: { id: menuItemId }, relations: ["club"] });
    let club = null;
    if (menuItem) {
      club = menuItem.club || (await clubRepo.findOne({ where: { id: menuItem.clubId } }));
    }
    const variantsWithDynamic = variants.map(variant => {
      let dynamicPrice = variant.price;
      if (variant.dynamicPricingEnabled && club) {
        dynamicPrice = computeDynamicPrice({
          basePrice: Number(variant.price),
          clubOpenDays: club.openDays,
          openHours: club.openHours,
        });
      }
      return {
        ...variant,
        dynamicPrice,
      };
    });
    res.json(variantsWithDynamic);
  } catch (err) {
    console.error("Error fetching variants:", err);
    res.status(500).json({ error: "Failed to load variants" });
  }
};

export const createMenuItemVariant = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can create variants" });
      return;
    }

    const { menuItemId, name, price } = req.body;
    const sanitized = sanitizeInput(name);

    if (!sanitized || typeof price !== "number" || price <= 0) {
      res.status(400).json({ error: "Variant name and positive price are required" });
      return;
    }

    const itemRepo = AppDataSource.getRepository(MenuItem);
    const variantRepo = AppDataSource.getRepository(MenuItemVariant);

    const menuItem = await itemRepo.findOneBy({ id: menuItemId });
    if (!menuItem || menuItem.clubId !== user.clubId) {
      res.status(403).json({ error: "Unauthorized or menu item not found" });
      return;
    }

    const existing = await variantRepo.findOne({ where: { name: sanitized, menuItemId } });
    if (existing) {
      res.status(400).json({ error: "Variant name must be unique for this item" });
      return;
    }

    const variant = variantRepo.create({
      name: sanitized,
      price,
      menuItemId,
      isActive: true,
    });

    await variantRepo.save(variant);
    res.status(201).json(variant);
  } catch (err) {
    console.error("Error creating variant:", err);
    res.status(500).json({ error: "Server error creating variant" });
  }
};

export const updateMenuItemVariant = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { name, price, isActive } = req.body;

    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can update variants" });
      return;
    }

    const variantRepo = AppDataSource.getRepository(MenuItemVariant);
    const itemRepo = AppDataSource.getRepository(MenuItem);

    const variant = await variantRepo.findOne({ 
      where: { id, isDeleted: false } 
    });
    if (!variant) {
      res.status(404).json({ error: "Variant not found" });
      return;
    }

    const menuItem = await itemRepo.findOneBy({ id: variant.menuItemId });
    if (!menuItem || menuItem.clubId !== user.clubId) {
      res.status(403).json({ error: "Unauthorized or item not found" });
      return;
    }

    if (typeof name === "string") {
      const sanitized = sanitizeInput(name);
      if (!sanitized) {
        res.status(400).json({ error: "Variant name is invalid" });
        return;
      }
      const existing = await variantRepo.findOne({ where: { name: sanitized, menuItemId: menuItem.id } });
      if (existing && existing.id !== variant.id) {
        res.status(400).json({ error: "Variant name must be unique" });
        return;
      }
      variant.name = sanitized;
    }

    if (price != null) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        res.status(400).json({ error: "Price must be a non-negative number" });
        return;
      }
      variant.price = parsedPrice;
    }

    if (typeof isActive === "boolean") {
      variant.isActive = isActive;
    }

    await variantRepo.save(variant);
    res.json(variant);
  } catch (err) {
    console.error("Error updating variant:", err);
    res.status(500).json({ error: "Failed to update variant" });
  }
};

export const deleteMenuItemVariant = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id } = req.params;

    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can delete variants" });
      return;
    }

    const variantRepo = AppDataSource.getRepository(MenuItemVariant);
    const itemRepo = AppDataSource.getRepository(MenuItem);
    const ticketIncludedMenuItemRepo = AppDataSource.getRepository(TicketIncludedMenuItem);
    const menuPurchaseRepo = AppDataSource.getRepository(MenuPurchase);

    const variant = await variantRepo.findOne({ 
      where: { id, isDeleted: false } 
    });
    if (!variant) {
      res.status(404).json({ error: "Variant not found" });
      return;
    }

    const item = await itemRepo.findOne({ 
      where: { id: variant.menuItemId, isDeleted: false } 
    });
    if (!item || item.clubId !== user.clubId) {
      res.status(403).json({ error: "Unauthorized to delete this variant" });
      return;
    }

    // Check if variant is included in any active ticket bundles
    const includedInTickets = await ticketIncludedMenuItemRepo.count({
      where: { variantId: id }
    });

    // Check if variant has any existing purchases
    const existingPurchases = await menuPurchaseRepo.count({
      where: { variantId: id }
    });

    if (includedInTickets > 0 || existingPurchases > 0) {
      // Soft delete - mark as deleted but keep the record
      variant.isDeleted = true;
      variant.deletedAt = new Date();
      variant.isActive = false; // Also deactivate to prevent new usage
      await variantRepo.save(variant);

      res.json({ 
        message: "Variant soft deleted successfully", 
        deletedAt: variant.deletedAt,
        includedInTickets,
        existingPurchases,
        note: "Variant marked as deleted but preserved due to existing purchases or ticket bundles"
      });
    } else {
      // Hard delete - no associated ticket bundles, safe to completely remove
      await variantRepo.remove(variant);
      res.json({ 
        message: "Variant permanently deleted successfully",
        note: "No associated ticket bundles found, variant completely removed"
      });
    }
  } catch (err) {
    console.error("Error deleting variant:", err);
    res.status(500).json({ error: "Server error deleting variant" });
  }
};

// PATCH /menu/variants/:id/toggle-dynamic-pricing — toggle dynamicPricingEnabled for variants
export const toggleMenuItemVariantDynamicPricing = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id } = req.params;
    
    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can modify menu item variants" });
      return;
    }
    const repo = AppDataSource.getRepository(MenuItemVariant);
    const variant = await repo.findOne({ 
      where: { id, isDeleted: false }, 
      relations: ["menuItem"] 
    });
    if (!variant || !variant.menuItem || variant.menuItem.clubId !== user.clubId) {
      res.status(403).json({ error: "Variant not found or not owned by your club" });
      return;
    }
    variant.dynamicPricingEnabled = !variant.dynamicPricingEnabled;
    await repo.save(variant);
    res.json({ message: "Menu item variant dynamic pricing toggled", dynamicPricingEnabled: variant.dynamicPricingEnabled });
  } catch (err) {
    console.error("Error toggling menu item variant dynamic pricing:", err);
    res.status(500).json({ error: "Server error toggling dynamic pricing" });
  }
};