import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuItem } from "../entities/MenuItem";
import { MenuCategory } from "../entities/MenuCategory";
import { sanitizeInput } from "../utils/sanitizeInput";

export const createMenuItem = async (req: Request, res: Response) => {
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
      return res.status(403).json({ error: "Only club owners can create menu items" });
    }

    const sanitizedName = sanitizeInput(name);
    if (!sanitizedName) {
      return res.status(400).json({ error: "Name is required" });
    }

    const category = await AppDataSource.getRepository(MenuCategory).findOne({
      where: { id: categoryId },
      relations: ["club"]
    });

    if (!category || category.club.id !== user.clubId) {
      return res.status(403).json({ error: "Invalid category or not owned by your club" });
    }

    if (hasVariants && price !== null) {
      return res.status(400).json({ error: "Price must be null when hasVariants is true" });
    }

    if (!hasVariants && (typeof price !== "number" || price <= 0)) {
      return res.status(400).json({ error: "Price must be a positive number if hasVariants is false" });
    }

    if (typeof maxPerPerson !== "number" || maxPerPerson <= 0) {
      return res.status(400).json({ error: "maxPerPerson must be a positive number" });
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

export const updateMenuItem = async (req: Request, res: Response) => {
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
      return res.status(403).json({ error: "Only club owners can update menu items" });
    }

    const repo = AppDataSource.getRepository(MenuItem);
    const item = await repo.findOne({
      where: { id },
      relations: ["club"]
    });

    if (!item || item.clubId !== user.clubId) {
      return res.status(403).json({ error: "Item not found or not owned by your club" });
    }

    if (typeof name === "string") {
      const sanitizedName = sanitizeInput(name);
      if (!sanitizedName) {
        return res.status(400).json({ error: "Name is required" });
      }
      item.name = sanitizedName;
    }

    if (typeof description === "string") {
      item.description = sanitizeInput(description) ?? undefined;
    }

    if (typeof imageUrl === "string") {
      item.imageUrl = imageUrl;
    }

    if (typeof hasVariants === "boolean") {
      item.hasVariants = hasVariants;

      if (hasVariants && price !== null) {
        return res.status(400).json({ error: "Price must be null when hasVariants is true" });
      }

      if (!hasVariants && (typeof price !== "number" || price <= 0)) {
        return res.status(400).json({ error: "Price must be a positive number if hasVariants is false" });
      }

      item.price = hasVariants ? null : price;
    }

    if (typeof maxPerPerson === "number") {
      if (maxPerPerson <= 0) {
        return res.status(400).json({ error: "maxPerPerson must be positive" });
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
