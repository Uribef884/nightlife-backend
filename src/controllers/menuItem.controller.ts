import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuItem } from "../entities/MenuItem";
import { MenuCategory } from "../entities/MenuCategory";
import { MenuItemVariant } from "../entities/MenuItemVariant";
import { AuthenticatedRequest } from "../types/express";
import { sanitizeInput } from "../utils/sanitizeInput";

export const createMenuItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const {
      name,
      description,
      imageUrl,
      price,
      maxPerPerson,
      hasVariants,
      categoryId,
      dynamicPricingEnabled
    } = req.body;

    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can create menu items" });
      return;
    }

    const sanitizedName = sanitizeInput(name);
    if (!sanitizedName) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const category = await AppDataSource.getRepository(MenuCategory).findOne({
      where: { id: categoryId },
      relations: ["club"]
    });

    if (!category || category.club.id !== user.clubId) {
      res.status(403).json({ error: "Invalid category or not owned by your club" });
      return;
    }

    if (hasVariants && price !== null) {
      res.status(400).json({ error: "Price must be null when hasVariants is true" });
      return;
    }

    if (!hasVariants && (typeof price !== "number" || price <= 0)) {
      res.status(400).json({ error: "Price must be a positive number if hasVariants is false" });
      return;
    }

    if (typeof maxPerPerson !== "number" || maxPerPerson <= 0) {
      res.status(400).json({ error: "maxPerPerson must be a positive number" });
      return;
    }

    const item = new MenuItem();
    item.name = sanitizedName;
    item.description = sanitizeInput(description) ?? undefined;
    item.imageUrl = imageUrl ?? null;
    item.price = hasVariants ? null : price;
    item.hasVariants = hasVariants;
    item.maxPerPerson = maxPerPerson;
    item.dynamicPricingEnabled = !!dynamicPricingEnabled;
    item.clubId = user.clubId;
    item.categoryId = categoryId;
    item.isActive = true;

    await AppDataSource.getRepository(MenuItem).save(item);
    res.status(201).json(item);
  } catch (err) {
    console.error("Failed to create menu item:", err);
    res.status(500).json({ error: "Server error creating item" });
  }
};

export const updateMenuItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id } = req.params;
    const {
      name,
      description,
      imageUrl,
      price,
      maxPerPerson,
      hasVariants,
      dynamicPricingEnabled
    } = req.body;

    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can update menu items" });
      return;
    }

    const repo = AppDataSource.getRepository(MenuItem);
    const item = await repo.findOne({
      where: { id },
      relations: ["club"]
    });

    if (!item || item.clubId !== user.clubId) {
      res.status(403).json({ error: "Item not found or not owned by your club" });
      return;
    }

    if (typeof hasVariants === "boolean" && hasVariants !== item.hasVariants) {
      res.status(400).json({ error: "Cannot change hasVariants after item creation" });
      return;
    }

    if (typeof name === "string") {
      const sanitizedName = sanitizeInput(name);
      if (!sanitizedName) {
        res.status(400).json({ error: "Name is required" });
        return;
      }
      item.name = sanitizedName;
    }

    if (typeof description === "string") {
      item.description = sanitizeInput(description) ?? undefined;
    }

    if (typeof imageUrl === "string") {
      item.imageUrl = imageUrl;
    }

    if (item.hasVariants) {
      if (price !== null) {
        res.status(400).json({ error: "Price must be null when hasVariants is true" });
        return;
      }
    } else {
      if (typeof price !== "number" || price <= 0) {
        res.status(400).json({ error: "Price must be a positive number if hasVariants is false" });
        return;
      }
      item.price = price;
    }

    if (typeof maxPerPerson === "number") {
      if (maxPerPerson <= 0) {
        res.status(400).json({ error: "maxPerPerson must be positive" });
        return;
      }
      item.maxPerPerson = maxPerPerson;
    }

    if (dynamicPricingEnabled !== undefined) {
      item.dynamicPricingEnabled = !!dynamicPricingEnabled;
    }

    await repo.save(item);
    res.json(item);
  } catch (err) {
    console.error("Error updating menu item:", err);
    res.status(500).json({ error: "Server error updating item" });
  }
};

export const getAllMenuItems = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const repo = AppDataSource.getRepository(MenuItem);
    const items = await repo.find({
      where: { isActive: true },
      relations: ["variants"],
      order: { name: "ASC" },
    });

    // Filter out inactive variants
    items.forEach(item => {
      if (item.variants) {
        item.variants = item.variants.filter(v => v.isActive);
      }
    });

    res.json(items);
  } catch (err) {
    console.error("Error fetching all menu items:", err);
    res.status(500).json({ error: "Failed to load menu items" });
  }
};

export const getMenuItemById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(MenuItem);
    const item = await repo.findOne({
      where: { id },
      relations: ["category", "club", "variants"],
    });

    if (!item) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }

    // Filter inactive variants
    item.variants = item.variants?.filter(v => v.isActive) ?? [];

    res.json(item);
  } catch (err) {
    console.error("Error fetching menu item by ID:", err);
    res.status(500).json({ error: "Failed to load menu item" });
  }
};

export const getItemsForMyClub = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can access this" });
      return;
    }

    const repo = AppDataSource.getRepository(MenuItem);
    const items = await repo.find({
      where: {
        clubId: user.clubId,
        isActive: true,
      },
      relations: ["category", "variants"],
      order: { name: "ASC" },
    });

    items.forEach(item => {
      if (item.variants) {
        item.variants = item.variants.filter(v => v.isActive);
      }
    });

    res.json(items);
  } catch (err) {
    console.error("Error fetching items for my club:", err);
    res.status(500).json({ error: "Failed to load your menu items" });
  }
};

export const deleteMenuItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id } = req.params;

    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can delete menu items" });
      return;
    }

    const itemRepo = AppDataSource.getRepository(MenuItem);
    const variantRepo = AppDataSource.getRepository(MenuItemVariant);

    const item = await itemRepo.findOne({ where: { id } });

    if (!item || item.clubId !== user.clubId) {
      res.status(403).json({ error: "Item not found or not owned by your club" });
      return;
    }

    await variantRepo.delete({ menuItemId: id });
    await itemRepo.remove(item);

    res.json({ message: "Menu item and variants deleted successfully" });
  } catch (err) {
    console.error("Error deleting menu item:", err);
    res.status(500).json({ error: "Failed to delete menu item" });
  }
};

  export const getMenuForClub = async (req: Request, res: Response): Promise<void> => {
    try {
      const { clubId } = req.params;
      const repo = AppDataSource.getRepository(MenuItem);

      const items = await repo.find({
        where: {
          clubId,
          isActive: true,
        },
        relations: ["category", "variants"],
        order: {
          category: {
            name: "ASC",
          },
          name: "ASC",
        },
      });

      items.forEach(item => {
        if (item.variants) {
          item.variants = item.variants.filter(v => v.isActive);
        }
      });

      res.json(items);
    } catch (err) {
      console.error("Error loading menu for club:", err);
      res.status(500).json({ error: "Failed to load club menu" });
    }
  };

  export const getPublicMenuForClub = async (req: Request, res: Response): Promise<void> => {
  try {
    const { clubId } = req.params;
    const repo = AppDataSource.getRepository(MenuItem);

    const items = await repo.find({
      where: {
        clubId,
        isActive: true,
      },
      relations: ["category", "variants"],
      order: {
        category: { name: "ASC" },
        name: "ASC",
      },
    });

    // Filter inactive variants and group by category
    const grouped: Record<string, any[]> = {};

    items.forEach(item => {
      const variants = item.variants?.filter(v => v.isActive) ?? [];

      const publicItem = {
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        price: item.hasVariants ? null : item.price,
        dynamicPricingEnabled: item.dynamicPricingEnabled,
        variants: item.hasVariants ? variants.map(v => ({ name: v.name, price: v.price })) : [],
      };

      const catName = item.category?.name || "Uncategorized";
      if (!grouped[catName]) grouped[catName] = [];
      grouped[catName].push(publicItem);
    });

    const result = Object.entries(grouped).map(([category, items]) => ({
      category,
      items,
    }));

    res.json(result);
  } catch (err) {
    console.error("Error loading public menu:", err);
    res.status(500).json({ error: "Failed to load public menu" });
  }
};
