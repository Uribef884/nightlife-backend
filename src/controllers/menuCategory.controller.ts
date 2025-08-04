import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuCategory } from "../entities/MenuCategory";
import { MenuItem } from "../entities/MenuItem";
import { Club } from "../entities/Club";
import { computeDynamicPrice } from "../utils/dynamicPricing";
import { sanitizeInput, sanitizeObject } from "../utils/sanitizeInput";
import { AuthenticatedRequest } from "../types/express";
import { In } from "typeorm";
import { MenuPurchase } from "../entities/MenuPurchase";

export const getAllMenuCategories = async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    
    // Check if club exists and its menu type
    const clubRepo = AppDataSource.getRepository(Club);
    const club = await clubRepo.findOne({ where: { id: clubId } });
    
    if (!club) {
      res.status(404).json({ error: "Club not found" });
      return;
    }

    // Check if club uses PDF menu
    if (club.menuType === "pdf") {
      res.status(400).json({ 
        error: "This club uses a PDF menu. Structured menu categories are not available." 
      });
      return;
    }

    const repo = AppDataSource.getRepository(MenuCategory);
    const categories = await repo.find({
      where: { clubId, isActive: true, isDeleted: false },
      relations: ["items", "items.variants", "items.club"]
    });

    const categoriesWithDynamicPrices = await Promise.all(
      categories.map(async (category) => {
        const menuItemsWithPrice = await Promise.all(
          category.items.map(async (item: MenuItem) => {
            const club = item.club;
            let basePrice = item.hasVariants ? 0 : Number(item.price!);
            
            // For items with variants, we'll show dynamic pricing for each variant
            let dynamicPrice = null;
            let discountApplied = 0;
            
            if (item.dynamicPricingEnabled && !item.hasVariants) {
              dynamicPrice = computeDynamicPrice({
                basePrice,
                clubOpenDays: club.openDays,
                openHours: Array.isArray(club.openHours) && club.openHours.length > 0 ? club.openHours[0].open + '-' + club.openHours[0].close : "",
              });
              discountApplied = Math.max(0, Math.round((basePrice - dynamicPrice) * 100) / 100);
            }
            
            // For items with variants, add dynamic pricing to each variant
            if (item.hasVariants && item.variants) {
              item.variants = item.variants.map(variant => {
                if (variant.dynamicPricingEnabled) {
                  const variantBasePrice = Number(variant.price);
                  const variantDynamicPrice = computeDynamicPrice({
                    basePrice: variantBasePrice,
                    clubOpenDays: club.openDays,
                    openHours: Array.isArray(club.openHours) && club.openHours.length > 0 ? club.openHours[0].open + '-' + club.openHours[0].close : "",
                  });
                  const variantDiscountApplied = Math.max(0, Math.round((variantBasePrice - variantDynamicPrice) * 100) / 100);
                  
                  return {
                    ...variant,
                    basePrice: variantBasePrice,
                    dynamicPrice: variantDynamicPrice,
                    discountApplied: variantDiscountApplied
                  };
                } else {
                  return {
                    ...variant,
                    basePrice: Number(variant.price),
                    dynamicPrice: Number(variant.price),
                    discountApplied: 0
                  };
                }
              });
            }
            
            return { 
              ...item, 
              basePrice,
              dynamicPrice, 
              discountApplied 
            };
          })
        );
        return { ...category, items: menuItemsWithPrice };
      })
    );

    res.json(categoriesWithDynamicPrices);
  } catch (err) {
    console.error("Failed to fetch menu categories:", err);
    res.status(500).json({ error: "Server error fetching menu categories" });
  }
};

export const createMenuCategory = async (req: Request, res: Response): Promise<void>  => {
  try {
    // Sanitize all string inputs
    const sanitizedBody = sanitizeObject(req.body, [
      'name'
    ], { maxLength: 100 });
    
    const { name } = sanitizedBody;
    const user = req.user;

    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can create categories" });
      return;
    }

    if (!user.clubId) {
      res.status(403).json({ error: "Club ID is required" });
      return;
    }

    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const newCategory = new MenuCategory();
    newCategory.name = name;
    newCategory.clubId = user.clubId;

    const repo = AppDataSource.getRepository(MenuCategory);
    await repo.save(newCategory);

    res.status(201).json(newCategory);
  } catch (err) {
    console.error("Error creating menu category:", err);
    res.status(500).json({ error: "Server error creating category" });
  }
};

export const updateMenuCategory = async (req: Request, res: Response): Promise<void>  => {
  try {
    const { id } = req.params;
    
    // Sanitize all string inputs
    const sanitizedBody = sanitizeObject(req.body, [
      'name'
    ], { maxLength: 100 });
    
    const { name } = sanitizedBody;
    const user = req.user;

    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can update categories" });
      return;
    }

    const repo = AppDataSource.getRepository(MenuCategory);
    const category = await repo.findOne({ 
      where: { id, isActive: true, isDeleted: false }, 
      relations: ["club"] 
    });

    if (!category || category.club.id !== user.clubId) {
      res.status(403).json({ error: "You can only update your own categories" });
      return;
    }

    if (name !== undefined) {
      if (!name) {
        res.status(400).json({ error: "Name is required" });
        return;
      }
      category.name = name;
    }

    await repo.save(category);

    res.json(category);
  } catch (err) {
    console.error("Error updating category:", err);
    res.status(500).json({ error: "Server error updating category" });
  }
};

export const deleteMenuCategory = async (req: Request, res: Response): Promise<void>  => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can delete categories" });
      return;
    }

    const repo = AppDataSource.getRepository(MenuCategory);
    const category = await repo.findOne({ 
      where: { id, isActive: true, isDeleted: false }, 
      relations: ["club"] 
    });

    if (!category || category.club.id !== user.clubId) {
      res.status(403).json({ error: "You can only delete your own categories" });
      return;
    }

    // Check if category has any menu items with purchases
    const menuItemRepo = AppDataSource.getRepository(MenuItem);
    const menuPurchaseRepo = AppDataSource.getRepository(MenuPurchase);
    
    // Get all menu items in this category
    const menuItems = await menuItemRepo.find({ where: { categoryId: id } });
    const menuItemIds = menuItems.map(item => item.id);
    
    // Check if any menu items have purchases
    let hasPurchases = false;
    if (menuItemIds.length > 0) {
      const purchaseCount = await menuPurchaseRepo.count({
        where: { menuItemId: In(menuItemIds) }
      });
      hasPurchases = purchaseCount > 0;
    }

    if (hasPurchases) {
      // Soft delete - mark as deleted but keep the record
      category.isDeleted = true;
      category.deletedAt = new Date();
      category.isActive = false; // Also deactivate to prevent new usage
      await repo.save(category);

      res.json({ 
        message: "Category soft deleted successfully", 
        deletedAt: category.deletedAt,
        hasPurchases,
        note: "Category marked as deleted but preserved due to existing purchases"
      });
    } else {
      // Hard delete - no associated purchases, safe to completely remove
      await repo.remove(category);
      res.json({ 
        message: "Category permanently deleted successfully",
        note: "No associated purchases found, category completely removed"
      });
    }
  } catch (err) {
    console.error("Error deleting category:", err);
    res.status(500).json({ error: "Server error deleting category" });
  }
};
