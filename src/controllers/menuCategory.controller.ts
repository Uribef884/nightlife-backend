import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuCategory } from "../entities/MenuCategory";
import { MenuItem } from "../entities/MenuItem";
import { computeDynamicPrice } from "../utils/dynamicPricing";
import { sanitizeInput } from "../utils/sanitizeInput";

export const getAllMenuCategories = async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(MenuCategory);
    const categories = await repo.find({
      relations: ["items", "items.variants", "items.club"]
    });

    const categoriesWithDynamicPrices = await Promise.all(
      categories.map(async (category) => {
        const menuItemsWithPrice = await Promise.all(
          category.items.map(async (item: MenuItem) => {
            const dynamicPrice = computeDynamicPrice({basePrice: item.hasVariants ? 0 : item.price!, clubOpenDays: item.club.openDays, openHours: item.club.openHours });
            return { ...item, dynamicPrice };
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

export const createMenuCategory = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const user = req.user;

    if (!user || user.role !== "clubowner") {
      return res.status(403).json({ error: "Only club owners can create categories" });
    }

    if (!user.clubId) {
      return res.status(403).json({ error: "Club ID is required" });
    }

    const sanitized = sanitizeInput(name);
    if (!sanitized) {
      return res.status(400).json({ error: "Name is required" });
    }

    const newCategory = new MenuCategory();
    newCategory.name = sanitized;
    newCategory.clubId = user.clubId;

    const repo = AppDataSource.getRepository(MenuCategory);
    await repo.save(newCategory);

    res.status(201).json(newCategory);
  } catch (err) {
    console.error("Error creating menu category:", err);
    res.status(500).json({ error: "Server error creating category" });
  }
};

export const updateMenuCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const user = req.user;

    if (!user || user.role !== "clubowner") {
      return res.status(403).json({ error: "Only club owners can update categories" });
    }

    const repo = AppDataSource.getRepository(MenuCategory);
    const category = await repo.findOne({ where: { id }, relations: ["club"] });

    if (!category || category.club.id !== user.clubId) {
      return res.status(403).json({ error: "You can only update your own categories" });
    }

    const sanitized = sanitizeInput(name);
    if (!sanitized) {
      return res.status(400).json({ error: "Name is required" });
    }

    category.name = sanitized;
    await repo.save(category);

    res.json(category);
  } catch (err) {
    console.error("Error updating category:", err);
    res.status(500).json({ error: "Server error updating category" });
  }
};

export const deleteMenuCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user || user.role !== "clubowner") {
      return res.status(403).json({ error: "Only club owners can delete categories" });
    }

    const repo = AppDataSource.getRepository(MenuCategory);
    const category = await repo.findOne({ where: { id }, relations: ["club"] });

    if (!category || category.club.id !== user.clubId) {
      return res.status(403).json({ error: "You can only delete your own categories" });
    }

    await repo.remove(category);
    res.status(204).send();
  } catch (err) {
    console.error("Error deleting category:", err);
    res.status(500).json({ error: "Server error deleting category" });
  }
};
