import { Request, Response } from "express";
import { AppDataSource } from "../../config/data-source";
import { MenuCategory } from "../../entities/MenuCategory";
import { MenuItem } from "../../entities/MenuItem";
import { MenuPurchase } from "../../entities/MenuPurchase";
import { AuthenticatedRequest } from "../../types/express";
import { sanitizeInput, sanitizeObject } from "../../utils/sanitizeInput";
import { In } from "typeorm";

// Admin function to get menu categories for a specific club
export const getAllMenuCategoriesAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { clubId } = req.params;
    const categoryRepo = AppDataSource.getRepository(MenuCategory);
    
    const categories = await categoryRepo.find({
      where: { clubId },
      order: { name: "ASC" }
    });

    res.status(200).json(categories);
  } catch (error) {
    console.error("❌ Error fetching menu categories:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to create menu category for a specific club
export const createMenuCategoryAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { clubId } = req.params;
    
    // Sanitize all string inputs
    const sanitizedBody = sanitizeObject(req.body, [
      'name'
    ], { maxLength: 500 });

    const { name, isActive } = sanitizedBody;

    if (!name) {
      res.status(400).json({ error: "Missing required field: name" });
      return;
    }

    const categoryRepo = AppDataSource.getRepository(MenuCategory);
    const newCategory = categoryRepo.create({
      name: name.trim(),
      isActive: isActive !== false,
      clubId: clubId,
    });

    await categoryRepo.save(newCategory);
    res.status(201).json(newCategory);
  } catch (error) {
    console.error("❌ Error creating menu category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to update menu category
export const updateMenuCategoryAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const categoryId = req.params.id;
    const categoryRepo = AppDataSource.getRepository(MenuCategory);

    const category = await categoryRepo.findOne({ where: { id: categoryId } });
    if (!category) {
      res.status(404).json({ error: "Menu category not found" });
      return;
    }

    // Sanitize inputs
    const sanitizedBody = sanitizeObject(req.body, [
      'name'
    ], { maxLength: 500 });

    const { name, isActive } = sanitizedBody;

    if (name !== undefined) category.name = name.trim();
    if (isActive !== undefined) category.isActive = isActive;

    await categoryRepo.save(category);
    res.status(200).json(category);
  } catch (error) {
    console.error("❌ Error updating menu category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to delete menu category
export const deleteMenuCategoryAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const categoryId = req.params.id;
    const categoryRepo = AppDataSource.getRepository(MenuCategory);

    const category = await categoryRepo.findOne({ where: { id: categoryId } });
    if (!category) {
      res.status(404).json({ error: "Menu category not found" });
      return;
    }

    // Check if category has any menu items with purchases
    const menuItemRepo = AppDataSource.getRepository(MenuItem);
    const menuPurchaseRepo = AppDataSource.getRepository(MenuPurchase);
    
    // Get all menu items in this category
    const menuItems = await menuItemRepo.find({ where: { categoryId: categoryId } });
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
      await categoryRepo.save(category);

      // Also soft delete all menu items in this category
      if (menuItems.length > 0) {
        for (const menuItem of menuItems) {
          menuItem.isDeleted = true;
          menuItem.deletedAt = new Date();
          menuItem.isActive = false;
        }
        await menuItemRepo.save(menuItems);
      }

      res.status(200).json({ 
        message: "Menu category soft deleted successfully", 
        deletedAt: category.deletedAt,
        hasPurchases,
        menuItemsDeleted: menuItems.length,
        note: "Category and menu items marked as deleted but preserved due to existing purchases"
      });
    } else {
      // Hard delete - no associated purchases, safe to completely remove
      await categoryRepo.remove(category);
      res.status(200).json({ 
        message: "Menu category permanently deleted successfully",
        note: "No associated purchases found, category completely removed"
      });
    }
  } catch (error) {
    console.error("❌ Error deleting menu category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}; 