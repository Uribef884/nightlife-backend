import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuCartItem } from "../entities/MenuCartItem";
import { MenuItem } from "../entities/MenuItem";
import { computeDynamicPrice } from "../utils/dynamicPricing";
import { AuthenticatedRequest } from "../types/express";
import { CartItem } from "../entities/TicketCartItem";

// ✅ Ownership check for deletion
function ownsMenuCartItem(item: MenuCartItem, userId?: string, sessionId?: string): boolean {
  if (userId) return item.userId === userId;
  return item.sessionId === sessionId;
}

// New function
export const addToMenuCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { menuItemId, variantId, quantity } = req.body;
    const userId = req.user?.id ?? null;
    const sessionId = !userId ? (req as any).sessionID : undefined;

    if (!menuItemId || quantity == null || quantity <= 0) {
      res.status(400).json({ error: "Missing or invalid fields" });
      return;
    }

    // 🛑 Enforce cart exclusivity
    const ticketCartRepo = AppDataSource.getRepository(CartItem);
    const existingTicketItems = await ticketCartRepo.find({ where: userId ? { userId } : { sessionId } });
    if (existingTicketItems.length > 0) {
      res.status(400).json({ error: "You must complete or clear your ticket cart before ordering menu items." });
      return;
    }

    const itemRepo = AppDataSource.getRepository(MenuItem);
    const cartRepo = AppDataSource.getRepository(MenuCartItem);

    const menuItem = await itemRepo.findOne({
      where: { id: menuItemId },
      relations: ["variants", "club"]
    });

    if (!menuItem || !menuItem.isActive) {
      res.status(400).json({ error: "Invalid or inactive menu item" });
      return;
    }

    if (menuItem.hasVariants && !variantId) {
      res.status(400).json({ error: "Variant is required for this item" });
      return;
    }

    if (!menuItem.hasVariants && variantId) {
      res.status(400).json({ error: "This item does not use variants" });
      return;
    }

    if (menuItem.maxPerPerson && quantity > menuItem.maxPerPerson) {
      res.status(400).json({ error: `Max per person for this item is ${menuItem.maxPerPerson}` });
      return;
    }

    const basePrice = menuItem.hasVariants
      ? menuItem.variants.find(v => v.id === variantId)?.price ?? 0
      : menuItem.price!;

    const unitPrice = computeDynamicPrice({
      basePrice,
      clubOpenDays: menuItem.club.openDays,
      openHours: menuItem.club.openHours
    });

    const where = userId
      ? { menuItemId, variantId: variantId ?? undefined, userId }
      : { menuItemId, variantId: variantId ?? undefined, sessionId };

    const existing = await cartRepo.findOne({ where });

    if (existing) {
      existing.quantity += quantity;
      existing.unitPrice = unitPrice;
      await cartRepo.save(existing);
      res.json(existing);
      return;
    }

    const newItem = new MenuCartItem();
    newItem.menuItemId = menuItemId;
    newItem.variantId = variantId ?? undefined;
    newItem.userId = userId ?? undefined;
    newItem.sessionId = sessionId;
    newItem.quantity = quantity;
    newItem.unitPrice = unitPrice;

    await cartRepo.save(newItem);
    res.status(201).json(newItem);
  } catch (err) {
    console.error("Error adding to menu cart:", err);
    res.status(500).json({ error: "Server error adding item" });
  }
};

export const updateMenuCartItem = async(req: AuthenticatedRequest, res: Response): Promise<void>=> {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    const userId = (req as any).user?.id ?? null;
    const sessionId = (req as any).sessionID;

    if (!quantity || quantity <= 0) {
      res.status(400).json({ error: "Quantity must be greater than zero" });
      return;
    }

    const cartRepo = AppDataSource.getRepository(MenuCartItem);
    const itemRepo = AppDataSource.getRepository(MenuItem);

    const cartItem = await cartRepo.findOne({ where: { id } });
    if (!cartItem) {
      res.status(404).json({ error: "Cart item not found" });
      return;
    }

    if (cartItem.userId !== userId && cartItem.sessionId !== sessionId) {
      res.status(403).json({ error: "Unauthorized to update this item" });
      return;
    }

    const menuItem = await itemRepo.findOne({
      where: { id: cartItem.menuItemId },
      relations: ["variants", "club"]
    });

    if (!menuItem || !menuItem.isActive) {
      res.status(400).json({ error: "Item no longer available" });
      return;
    }

    if (menuItem.maxPerPerson && quantity > menuItem.maxPerPerson) {
      res.status(400).json({
        error: `Max per person for this item is ${menuItem.maxPerPerson}`
      });
      return;
    }

    const basePrice = menuItem.hasVariants
      ? menuItem.variants.find(v => v.id === cartItem.variantId)?.price ?? 0
      : menuItem.price!;

    cartItem.quantity = quantity;
    cartItem.unitPrice = computeDynamicPrice({
      basePrice,
      clubOpenDays: menuItem.club.openDays,
      openHours: menuItem.club.openHours
    });

    await cartRepo.save(cartItem);
    res.json(cartItem);
  } catch (err) {
    console.error("Error updating cart item:", err);
    res.status(500).json({ error: "Server error updating item" });
  }
};

// ✅ GET /menu/cart — user or session
export const getUserMenuCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const sessionId = !userId ? (req as any).sessionID : undefined;

    const cartRepo = AppDataSource.getRepository(MenuCartItem);
    const whereClause = userId ? { userId } : { sessionId };

    const items = await cartRepo.find({
      where: whereClause,
      relations: ["menuItem", "variant", "menuItem.club"],
      order: { createdAt: "DESC" },
    });

    const enrichedItems = items.map(item => {
      const { menuItem, variant } = item;
      const basePrice = menuItem.hasVariants
        ? variant?.price ?? 0
        : menuItem.price!;

      const currentPrice = computeDynamicPrice({
        basePrice,
        clubOpenDays: menuItem.club.openDays,
        openHours: menuItem.club.openHours,
      });

      const discountApplied = Math.max(0, Math.round((basePrice - currentPrice) * 100) / 100);

      return {
        ...item,
        currentPrice,
        discountApplied
      };
    });

    res.status(200).json(enrichedItems);
  } catch (err) {
    console.error("❌ Error fetching menu cart:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ✅ DELETE /menu/cart/:id — secure delete
export const removeMenuCartItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const sessionId = !userId ? (req as any).sessionID : undefined;

    const cartRepo = AppDataSource.getRepository(MenuCartItem);
    const item = await cartRepo.findOneBy({ id });

    if (!item) {
      res.status(404).json({ error: "Menu cart item not found" });
      return;
    }

    if (!ownsMenuCartItem(item, userId, sessionId)) {
      res.status(403).json({ error: "You cannot delete another user's menu cart item" });
      return;
    }

    await cartRepo.remove(item);
    res.status(204).send();
  } catch (err) {
    console.error("❌ Error removing menu cart item:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

//Used if user want to add tickets to existing menu cart
export const clearMenuCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const sessionId = !userId ? (req as any).sessionId : undefined;

    const cartRepo = AppDataSource.getRepository(MenuCartItem);
    const whereClause = userId ? { userId } : { sessionId };

    await cartRepo.delete(whereClause);
    res.status(204).send();
  } catch (err) {
    console.error("❌ Error clearing menu cart:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
