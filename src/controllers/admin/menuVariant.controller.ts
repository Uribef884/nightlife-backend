import { Request, Response } from "express";
import { AppDataSource } from "../../config/data-source";
import { MenuItemVariant } from "../../entities/MenuItemVariant";
import { MenuItem } from "../../entities/MenuItem";
import { TicketIncludedMenuItem } from "../../entities/TicketIncludedMenuItem";
import { MenuPurchase } from "../../entities/MenuPurchase";
import { sanitizeInput, sanitizeObject } from "../../utils/sanitizeInput";
import { AuthenticatedRequest } from "../../types/express";

// Admin function to get variants by menu item ID
export const getVariantsByMenuItemIdAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { menuItemId } = req.params;
    const variantRepo = AppDataSource.getRepository(MenuItemVariant);
    
    const variants = await variantRepo.find({
      where: { menuItemId, isActive: true, isDeleted: false },
      order: { name: "ASC" },
    });

    res.json(variants);
  } catch (err) {
    console.error("❌ Error fetching variants:", err);
    res.status(500).json({ error: "Failed to load variants" });
  }
};

// Admin function to create menu item variant
export const createMenuItemVariantAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Sanitize all string inputs
    const sanitizedBody = sanitizeObject(req.body, [
      'name'
    ], { maxLength: 100 });
    
    const { menuItemId, name, price, dynamicPricingEnabled, maxPerPerson } = sanitizedBody;

    // Validate required fields
    if (!menuItemId) {
      res.status(400).json({ error: "menuItemId is required" });
      return;
    }

    if (!name) {
      res.status(400).json({ error: "Variant name is required" });
      return;
    }

    if (typeof price !== "number" || price <= 0) {
      res.status(400).json({ error: "Price must be a positive number (greater than 0)" });
      return;
    }

    if (maxPerPerson !== undefined && maxPerPerson !== null) {
      if (typeof maxPerPerson !== "number" || maxPerPerson <= 0) {
        res.status(400).json({ error: "maxPerPerson must be a positive number" });
        return;
      }
    }

    const itemRepo = AppDataSource.getRepository(MenuItem);
    const variantRepo = AppDataSource.getRepository(MenuItemVariant);

    const menuItem = await itemRepo.findOneBy({ id: menuItemId });
    if (!menuItem) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }

    // ❌ Validate that menu item belongs to the expected club
    const expectedClubId = req.params.clubId;
    if (menuItem.clubId !== expectedClubId) {
      res.status(403).json({ 
        error: `Menu item '${menuItem.name}' does not belong to the specified club` 
      });
      return;
    }

    const existing = await variantRepo.findOne({ where: { name, menuItemId } });
    if (existing) {
      res.status(400).json({ error: "Variant name must be unique for this item" });
      return;
    }

    const variant = variantRepo.create({
      name,
      price,
      menuItemId,
      isActive: true,
      dynamicPricingEnabled: dynamicPricingEnabled !== undefined ? !!dynamicPricingEnabled : true, // Default to true for variants
      maxPerPerson: maxPerPerson || undefined,
    });

    await variantRepo.save(variant);
    res.status(201).json(variant);
  } catch (error) {
    console.error("❌ Error creating menu item variant:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to update menu item variant
export const updateMenuItemVariantAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const variantRepo = AppDataSource.getRepository(MenuItemVariant);

    const variant = await variantRepo.findOne({ 
      where: { id, isDeleted: false },
      relations: ["menuItem"]
    });
    if (!variant) {
      res.status(404).json({ error: "Variant not found" });
      return;
    }

    // ❌ Validate that variant's menu item belongs to the expected club
    const expectedClubId = req.params.clubId;
    if (variant.menuItem.clubId !== expectedClubId) {
      res.status(403).json({ 
        error: `Variant '${variant.name}' does not belong to the specified club` 
      });
      return;
    }

    // Sanitize all string inputs
    const sanitizedBody = sanitizeObject(req.body, [
      'name'
    ], { maxLength: 100 });
    
    const { name, price, isActive, dynamicPricingEnabled, maxPerPerson } = sanitizedBody;

    if (name !== undefined) {
      if (!name) {
        res.status(400).json({ error: "Variant name is invalid" });
        return;
      }
      const existing = await variantRepo.findOne({ where: { name, menuItemId: variant.menuItemId } });
      if (existing && existing.id !== variant.id) {
        res.status(400).json({ error: "Variant name must be unique" });
        return;
      }
      variant.name = name;
    }

    if (price != null) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        res.status(400).json({ error: "Price must be a positive number (greater than 0)" });
        return;
      }
      variant.price = parsedPrice;
    }

    if (typeof isActive === "boolean") {
      variant.isActive = isActive;
    }

    if (typeof dynamicPricingEnabled === "boolean") {
      variant.dynamicPricingEnabled = dynamicPricingEnabled;
    }

    if (maxPerPerson !== undefined) {
      if (maxPerPerson !== null && (typeof maxPerPerson !== "number" || maxPerPerson <= 0)) {
        res.status(400).json({ error: "maxPerPerson must be a positive number or null" });
        return;
      }
      variant.maxPerPerson = maxPerPerson;
    }

    await variantRepo.save(variant);
    res.json(variant);
  } catch (error) {
    console.error("❌ Error updating menu item variant:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to delete menu item variant
export const deleteMenuItemVariantAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const variantRepo = AppDataSource.getRepository(MenuItemVariant);
    const ticketIncludedMenuItemRepo = AppDataSource.getRepository(TicketIncludedMenuItem);
    const menuPurchaseRepo = AppDataSource.getRepository(MenuPurchase);

        const variant = await variantRepo.findOne({ 
      where: { id, isDeleted: false }, 
      relations: ["menuItem"] 
    });
    if (!variant) {
      res.status(404).json({ error: "Variant not found" });
      return;
    }

    // ❌ Validate that variant's menu item belongs to the expected club
    const expectedClubId = req.params.clubId;
    if (variant.menuItem.clubId !== expectedClubId) {
      res.status(403).json({ 
        error: `Variant '${variant.name}' does not belong to the specified club` 
      });
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
        note: "Variant marked as deleted but preserved due to existing purchases or ticket inclusions"
      });
    } else {
      // Hard delete - no associated data, safe to completely remove
      await variantRepo.remove(variant);
      res.json({ 
        message: "Variant permanently deleted successfully",
        note: "No associated purchases or ticket inclusions found, variant completely removed"
      });
    }
  } catch (error) {
    console.error("❌ Error deleting menu item variant:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to toggle menu item variant dynamic pricing
export const toggleMenuItemVariantDynamicPricingAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const variantRepo = AppDataSource.getRepository(MenuItemVariant);

    const variant = await variantRepo.findOne({ 
      where: { id, isDeleted: false }, 
      relations: ["menuItem"] 
    });
    if (!variant) {
      res.status(404).json({ error: "Variant not found" });
      return;
    }

    variant.dynamicPricingEnabled = !variant.dynamicPricingEnabled;
    await variantRepo.save(variant);
    res.json({ message: "Menu item variant dynamic pricing toggled", dynamicPricingEnabled: variant.dynamicPricingEnabled });
  } catch (error) {
    console.error("❌ Error toggling menu item variant dynamic pricing:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}; 