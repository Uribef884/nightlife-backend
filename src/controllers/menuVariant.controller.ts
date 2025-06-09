import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuItemVariant } from "../entities/MenuItemVariant";
import { MenuItem } from "../entities/MenuItem";
import { sanitizeInput } from "../utils/sanitizeInput";

// PATCH /menu/variants/:id
export const updateMenuItemVariant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const { name, price } = req.body;

    if (!user || user.role !== "clubowner") {
      return res.status(403).json({ error: "Only club owners can update variants" });
    }

    const variantRepo = AppDataSource.getRepository(MenuItemVariant);
    const variant = await variantRepo.findOne({
      where: { id },
      relations: ["menuItem"]
    });

    if (!variant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    const itemRepo = AppDataSource.getRepository(MenuItem);
    const item = await itemRepo.findOne({
      where: { id: variant.menuItemId },
      relations: ["club"]
    });

    if (!item || item.clubId !== user.clubId) {
      return res.status(403).json({ error: "Unauthorized to modify this variant" });
    }

    if (typeof name === "string") {
      const cleanName = sanitizeInput(name);
      if (!cleanName) {
        return res.status(400).json({ error: "Name is required" });
      }

      // Check uniqueness within this MenuItem
      const existing = await variantRepo.findOne({
        where: {
          name: cleanName,
          menuItemId: variant.menuItemId
        }
      });

      if (existing && existing.id !== variant.id) {
        return res.status(409).json({ error: "Name must be unique for this item" });
      }

      variant.name = cleanName;
    }

    if (typeof price === "number") {
      if (price <= 0) {
        return res.status(400).json({ error: "Price must be greater than 0" });
      }
      variant.price = price;
    }

    await variantRepo.save(variant);
    res.json(variant);
  } catch (err) {
    console.error("Error updating variant:", err);
    res.status(500).json({ error: "Server error updating variant" });
  }
};
