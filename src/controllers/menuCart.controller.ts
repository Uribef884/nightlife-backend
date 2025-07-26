import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuCartItem } from "../entities/MenuCartItem";
import { MenuItem } from "../entities/MenuItem";
import { Club } from "../entities/Club";
import { computeDynamicPrice } from "../utils/dynamicPricing";
import { AuthenticatedRequest } from "../types/express";
import { CartItem } from "../entities/TicketCartItem";

// ✅ Ownership check for deletion
function ownsMenuCartItem(item: MenuCartItem, userId?: string, sessionId?: string): boolean {
  if (userId) return item.userId === userId;
  return item.sessionId === sessionId;
}

export const addToMenuCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { menuItemId, variantId, quantity } = req.body;
    const userId: string | undefined = req.user?.id;
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

    // Ensure we have either a userId or sessionId
    if (!userId && !sessionId) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }

    if (!menuItemId || quantity == null || quantity <= 0) {
      res.status(400).json({ error: "Missing or invalid fields" });
      return;
    }

    // 🛑 Enforce ticket cart exclusivity
    const ticketCartRepo = AppDataSource.getRepository(CartItem);
    const existingTicketItems = await ticketCartRepo.find({ where: userId ? { userId } : { sessionId } });
    if (existingTicketItems.length > 0) {
      res.status(400).json({ error: "You must complete or clear your ticket cart before ordering menu items." });
      return;
    }

    // Check menu item and club
    const itemRepo = AppDataSource.getRepository(MenuItem);
    const cartRepo = AppDataSource.getRepository(MenuCartItem);

    const menuItem = await itemRepo.findOne({
      where: { id: menuItemId },
      relations: ["variants", "club"]
    });

    if (!menuItem) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }

    // Check if club is in structured menu mode
    if (menuItem.club.menuType !== "structured") {
      const errorMessage = menuItem.club.menuType === "none" 
        ? "This club does not offer menu ordering."
        : "This club's menu is not available for ordering. Please contact the club directly.";
      
      res.status(400).json({ error: errorMessage });
      return;
    }

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

    const existingMenuItems = await cartRepo.find({ where: userId ? { userId } : { sessionId } });
    if (existingMenuItems.length > 0) {
      const existingClubId = existingMenuItems[0].clubId;
      if (existingClubId !== menuItem.clubId) {
        res.status(400).json({
          error: "You can only add items from one club to your cart. Please clear your cart first."
        });
        return;
      }
    }

    const basePrice = menuItem.hasVariants
      ? menuItem.variants.find(v => v.id === variantId)?.price ?? 0
      : menuItem.price!;

    const where = userId
      ? { userId, menuItemId, variantId: variantId || null }
      : { sessionId, menuItemId, variantId: variantId || null };

    const existing = await cartRepo.findOne({ where });

    if (existing) {
      const newTotal = existing.quantity + quantity;
      existing.quantity = newTotal;
      await cartRepo.save(existing);
      res.json(existing);
    } else {
      const newItem = cartRepo.create({
        menuItemId,
        variantId: variantId || null,
      });

      newItem.userId = userId ?? null;
      newItem.sessionId = sessionId ?? null;
      newItem.quantity = quantity;
      newItem.clubId = menuItem.clubId;

      await cartRepo.save(newItem);
      res.status(201).json(newItem);
    }
  } catch (err) {
    console.error("❌ Error adding to menu cart:", err);
    res.status(500).json({ error: "Server error adding item" });
  }
};

export const updateMenuCartItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    const userId = req.user?.id ?? null;
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

    // Ensure we have either a userId or sessionId
    if (!userId && !sessionId) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }

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

    const menuItem = await itemRepo.findOne({ where: { id: cartItem.menuItemId } });
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

    cartItem.quantity = quantity;
    await cartRepo.save(cartItem);

    res.json(cartItem);
  } catch (err) {
    console.error("❌ Error updating cart item:", err);
    res.status(500).json({ error: "Server error updating item" });
  }
};

// ✅ GET /menu/cart — user or session
export const getUserMenuCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

    // Ensure we have either a userId or sessionId
    if (!userId && !sessionId) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }
    const cartRepo = AppDataSource.getRepository(MenuCartItem);
    const whereClause = userId ? { userId } : { sessionId };

    const items = await cartRepo.find({
      where: whereClause,
      relations: ["menuItem", "variant", "menuItem.club"],
      order: { createdAt: "DESC" },
    });

    const enrichedItems = items.map(item => {
      const { menuItem, variant } = item;
      const club = menuItem.club;
      const basePrice = menuItem.hasVariants
        ? Number(variant?.price ?? 0)
        : Number(menuItem.price!);

      // Calculate dynamic pricing
      let dynamicPrice = basePrice;
      
      if (menuItem.dynamicPricingEnabled && club) {
        dynamicPrice = computeDynamicPrice({
          basePrice,
          clubOpenDays: club.openDays,
          openHours: club.openHours,
          useDateBasedLogic: false,
        });
      }

      return {
        id: item.id,
        menuItemId: item.menuItemId,
        variantId: item.variantId,
        quantity: item.quantity,
        menuItem: {
          ...menuItem,
          price: basePrice,
          dynamicPrice: dynamicPrice
        },
        variant: variant,
        basePrice,
        dynamicPrice,
        discountApplied: Math.max(0, basePrice - dynamicPrice)
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
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

    // Ensure we have either a userId or sessionId
    if (!userId && !sessionId) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }

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


export const clearMenuCart = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

    // Ensure we have either a userId or sessionId
    if (!userId && !sessionId) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }

    const cartRepo = AppDataSource.getRepository(MenuCartItem);
    const whereClause = userId ? { userId } : { sessionId };

    await cartRepo.delete(whereClause);
    res.status(204).send();
  } catch (err) {
    console.error("❌ Error clearing menu cart:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

//Used if user want to add tickets to existing menu cart
export const clearTicketCartFromMenu = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const sessionId: string | undefined = !userId && req.sessionId ? req.sessionId : undefined;

    // Ensure we have either a userId or sessionId
    if (!userId && !sessionId) {
      res.status(401).json({ error: "Missing or invalid token" });
      return;
    }

    const cartRepo = AppDataSource.getRepository(CartItem); // TicketCartItem
    const whereClause = userId ? { userId } : { sessionId };

    await cartRepo.delete(whereClause);
    res.status(204).send();
  } catch (err) {
    console.error("❌ Error clearing ticket cart from menu flow:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
