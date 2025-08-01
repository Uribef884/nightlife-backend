import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuItem } from "../entities/MenuItem";
import { MenuCategory } from "../entities/MenuCategory";
import { MenuItemVariant } from "../entities/MenuItemVariant";
import { TicketIncludedMenuItem } from "../entities/TicketIncludedMenuItem";
import { MenuPurchase } from "../entities/MenuPurchase";
import { Club } from "../entities/Club";
import { AuthenticatedRequest } from "../types/express";
import { sanitizeInput, sanitizeObject } from "../utils/sanitizeInput";
import { computeDynamicPrice } from "../utils/dynamicPricing";
import { validateImageUrlWithResponse } from "../utils/validateImageUrl";

export const createMenuItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    // Sanitize all string inputs
    const sanitizedBody = sanitizeObject(req.body, [
      'name', 'description'
    ], { maxLength: 500 });
    
    const {
      name,
      description,
      price,
      maxPerPerson,
      hasVariants,
      categoryId,
      dynamicPricingEnabled
    } = sanitizedBody;

    // Parse boolean values from form data
    const hasVariantsBool = hasVariants === "true" || hasVariants === true;
    const dynamicPricingEnabledBool = dynamicPricingEnabled === "true" || dynamicPricingEnabled === true;
    const priceNum = price && price !== "" ? Number(price) : undefined;
    const maxPerPersonNum = maxPerPerson && maxPerPerson !== "" ? Number(maxPerPerson) : undefined;

    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can create menu items" });
      return;
    }

    // Check if club is in structured menu mode
    const clubRepo = AppDataSource.getRepository(Club);
    const club = await clubRepo.findOne({ where: { ownerId: user.id } });
    
    if (!club) {
      res.status(404).json({ error: "Club not found" });
      return;
    }

    if (club.menuType !== "structured") {
      res.status(400).json({ 
        error: "Club must be in structured menu mode to create menu items. Switch to structured mode first." 
      });
      return;
    }

    if (!name) {
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

    if (hasVariantsBool && priceNum !== null && priceNum !== undefined) {
      res.status(400).json({ error: "Price must be null when hasVariants is true" });
      return;
    }

    if (!hasVariantsBool && (typeof priceNum !== "number" || priceNum <= 0)) {
      res.status(400).json({ error: "Price must be a positive number if hasVariants is false" });
      return;
    }

    if (hasVariantsBool && maxPerPersonNum !== null && maxPerPersonNum !== undefined) {
      res.status(400).json({ error: "maxPerPerson must be null when hasVariants is true" });
      return;
    }

    if (!hasVariantsBool && (typeof maxPerPersonNum !== "number" || maxPerPersonNum <= 0)) {
      res.status(400).json({ error: "maxPerPerson must be a positive number if hasVariants is false" });
      return;
    }

    // Enforce that parent menu items with variants cannot have dynamic pricing enabled
    if (hasVariantsBool && dynamicPricingEnabledBool) {
      res.status(400).json({ 
        error: "Parent menu items with variants cannot have dynamic pricing enabled. Dynamic pricing should be configured on individual variants instead." 
      });
      return;
    }

    // Validate image file
    if (!req.file) {
      res.status(400).json({ error: "Image file is required." });
      return;
    }

    // Process image
    const processed = await (await import("../services/imageService")).ImageService.processImage(req.file.buffer);

    // Create menu item
    const itemRepo = AppDataSource.getRepository(MenuItem);
    const item = new MenuItem();
    item.name = name;
    item.description = description ?? undefined;
    item.price = hasVariantsBool ? undefined : priceNum;
    item.maxPerPerson = hasVariantsBool ? undefined : maxPerPersonNum;
    item.hasVariants = hasVariantsBool;
    item.dynamicPricingEnabled = dynamicPricingEnabledBool;
    item.categoryId = categoryId;
    item.clubId = user.clubId;
    item.imageUrl = ""; // will be set after upload
    item.imageBlurhash = processed.blurhash;
    item.isActive = true;

    await itemRepo.save(item);

    // Upload image to S3
    const { S3Service } = await import("../services/s3Service");
    const key = S3Service.generateKey(user.clubId, 'menu-item');
    const uploadResult = await S3Service.uploadFile(processed.buffer, 'image/jpeg', key);
    
    // Update item with image URL
    item.imageUrl = uploadResult.url;
    await itemRepo.save(item);

    res.status(201).json(item);
  } catch (err) {
    console.error("Error creating menu item:", err);
    res.status(500).json({ error: "Server error creating item" });
  }
};

export const updateMenuItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id } = req.params;
    
    // Sanitize all string inputs
    const sanitizedBody = sanitizeObject(req.body, [
      'name', 'description', 'imageUrl'
    ], { maxLength: 500 });
    
    const {
      name,
      description,
      imageUrl,
      price,
      maxPerPerson,
      hasVariants,
      dynamicPricingEnabled
    } = sanitizedBody;

    // Validate image URL if provided
    if (imageUrl && !validateImageUrlWithResponse(imageUrl, res)) {
      return;
    }

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
      if (item.hasVariants) {
        res.status(400).json({ error: "maxPerPerson must be null when hasVariants is true" });
        return;
      }
      if (maxPerPerson <= 0) {
        res.status(400).json({ error: "maxPerPerson must be positive" });
        return;
      }
      item.maxPerPerson = maxPerPerson;
    } else if (maxPerPerson === null || maxPerPerson === undefined) {
      // Allow setting maxPerPerson to null/undefined for items with variants
      if (!item.hasVariants) {
        res.status(400).json({ error: "maxPerPerson is required for items without variants" });
        return;
      }
      item.maxPerPerson = undefined;
    }

    if (dynamicPricingEnabled !== undefined) {
      // Enforce that parent menu items with variants cannot have dynamic pricing enabled
      if (item.hasVariants && dynamicPricingEnabled) {
        res.status(400).json({ 
          error: "Parent menu items with variants cannot have dynamic pricing enabled. Dynamic pricing should be configured on individual variants instead." 
        });
        return;
      }
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
    const clubRepo = AppDataSource.getRepository(Club);
    const items = await repo.find({
      where: { isActive: true, isDeleted: false },
      relations: ["variants", "club"],
      order: { name: "ASC" },
    });

    // Filter out inactive and soft-deleted variants
    const itemsWithDynamic = await Promise.all(items.map(async item => {
      if (item.variants) {
        item.variants = item.variants.filter(v => v.isActive && !v.isDeleted);
      }
      const club = item.club || (await clubRepo.findOne({ where: { id: item.clubId } }));
      let dynamicPrice = null;
      if (item.dynamicPricingEnabled && !item.hasVariants && club) {
        dynamicPrice = computeDynamicPrice({
          basePrice: Number(item.price),
          clubOpenDays: club.openDays,
          openHours: club.openHours,
        });
      }
      let variants = item.variants;
      if (item.hasVariants && variants && club) {
        variants = variants.map(variant => {
          let vDynamicPrice = variant.price;
          if (variant.dynamicPricingEnabled) {
            vDynamicPrice = computeDynamicPrice({
              basePrice: Number(variant.price),
              clubOpenDays: club.openDays,
              openHours: club.openHours,
            });
          }
          return {
            ...variant,
            dynamicPrice: vDynamicPrice,
          };
        });
      }
      return {
        ...item,
        dynamicPrice,
        variants,
      };
    }));
    res.json(itemsWithDynamic);
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
      where: { id, isDeleted: false },
      relations: ["category", "club", "variants"],
    });

    if (!item) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }

    // Filter inactive and soft-deleted variants
    item.variants = item.variants?.filter(v => v.isActive && !v.isDeleted) ?? [];

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
        isDeleted: false,
      },
      relations: ["category", "variants"],
      order: { name: "ASC" },
    });

    items.forEach(item => {
      if (item.variants) {
        item.variants = item.variants.filter(v => v.isActive && !v.isDeleted);
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
    const ticketIncludedMenuItemRepo = AppDataSource.getRepository(TicketIncludedMenuItem);
    const menuPurchaseRepo = AppDataSource.getRepository(MenuPurchase);

    const item = await itemRepo.findOne({ 
      where: { id, isDeleted: false } 
    });

    if (!item || item.clubId !== user.clubId) {
      res.status(403).json({ error: "Item not found or not owned by your club" });
      return;
    }

    // Check if menu item is included in any active ticket bundles
    const includedInTickets = await ticketIncludedMenuItemRepo.count({
      where: { menuItemId: id }
    });

    // Check if menu item has any existing purchases
    const existingPurchases = await menuPurchaseRepo.count({
      where: { menuItemId: id }
    });

    if (includedInTickets > 0 || existingPurchases > 0) {
      // Soft delete - mark as deleted but keep the record
      item.isDeleted = true;
      item.deletedAt = new Date();
      item.isActive = false; // Also deactivate to prevent new usage
      await itemRepo.save(item);

      // Also soft delete all variants of this menu item
      const variants = await variantRepo.find({ where: { menuItemId: id } });
      for (const variant of variants) {
        variant.isDeleted = true;
        variant.deletedAt = new Date();
        variant.isActive = false;
        await variantRepo.save(variant);
      }

      res.json({ 
        message: "Menu item soft deleted successfully", 
        deletedAt: item.deletedAt,
        includedInTickets,
        existingPurchases,
        note: "Menu item marked as deleted but preserved due to existing purchases or ticket bundles"
      });
    } else {
      // Hard delete - no associated ticket bundles, safe to completely remove
      await variantRepo.delete({ menuItemId: id });
      await itemRepo.remove(item);

      res.json({ 
        message: "Menu item permanently deleted successfully",
        note: "No associated ticket bundles found, menu item completely removed"
      });
    }
  } catch (err) {
    console.error("Error deleting menu item:", err);
    res.status(500).json({ error: "Failed to delete menu item" });
  }
};

  export const getMenuForClub = async (req: Request, res: Response): Promise<void> => {
    try {
      const { clubId } = req.params;
      const repo = AppDataSource.getRepository(MenuItem);
      const clubRepo = AppDataSource.getRepository(Club);
      const club = await clubRepo.findOne({ where: { id: clubId } });

          const items = await repo.find({
      where: {
        clubId,
        isActive: true,
        isDeleted: false,
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

      const itemsWithDynamic = items.map(item => {
        let dynamicPrice = null;
        if (item.dynamicPricingEnabled && !item.hasVariants && club) {
          dynamicPrice = computeDynamicPrice({
            basePrice: Number(item.price),
            clubOpenDays: club.openDays,
            openHours: club.openHours,
          });
        }
        let variants = item.variants;
        if (item.hasVariants && variants && club) {
          variants = variants.map(variant => {
            let vDynamicPrice = variant.price;
            if (variant.dynamicPricingEnabled) {
              vDynamicPrice = computeDynamicPrice({
                basePrice: Number(variant.price),
                clubOpenDays: club.openDays,
                openHours: club.openHours,
              });
            }
            return {
              ...variant,
              dynamicPrice: vDynamicPrice,
            };
          });
        }
        return {
          ...item,
          dynamicPrice,
          variants,
        };
      });

      res.json(itemsWithDynamic);
    } catch (err) {
      console.error("Error loading menu for club:", err);
      res.status(500).json({ error: "Failed to load club menu" });
    }
  };

  export const getPublicMenuForClub = async (req: Request, res: Response): Promise<void> => {
  try {
    const { clubId } = req.params;
    const repo = AppDataSource.getRepository(MenuItem);
    const clubRepo = AppDataSource.getRepository(Club);
    const club = await clubRepo.findOne({ where: { id: clubId } });

    const items = await repo.find({
      where: {
        clubId,
        isActive: true,
        isDeleted: false,
      },
      relations: ["category", "variants"],
      order: {
        category: { name: "ASC" },
        name: "ASC",
      },
    });

    // Filter inactive and soft-deleted variants and group by category
    const grouped: Record<string, any> = {};

    items.forEach(item => {
      const variants = item.variants?.filter(v => v.isActive && !v.isDeleted) ?? [];
      let dynamicPrice = null;
      if (item.dynamicPricingEnabled && !item.hasVariants && club) {
        dynamicPrice = computeDynamicPrice({
          basePrice: Number(item.price),
          clubOpenDays: club.openDays,
          openHours: club.openHours,
        });
      }
      const publicItem = {
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        price: item.hasVariants ? null : item.price,
        dynamicPricingEnabled: item.dynamicPricingEnabled,
        dynamicPrice,
        variants: item.hasVariants
          ? variants.map(v => {
              let vDynamicPrice = v.price;
              if (v.dynamicPricingEnabled && club) {
                vDynamicPrice = computeDynamicPrice({
                  basePrice: Number(v.price),
                  clubOpenDays: club.openDays,
                  openHours: club.openHours,
                });
              }
              return {
                id: v.id,
                name: v.name,
                price: v.price,
                dynamicPricingEnabled: v.dynamicPricingEnabled,
                dynamicPrice: vDynamicPrice,
              };
            })
          : [],
      };

      const catKey = item.category?.id || "uncategorized";
      if (!grouped[catKey]) {
        grouped[catKey] = {
          id: item.category?.id || null,
          name: item.category?.name || "Uncategorized",
          items: []
        };
      }
      grouped[catKey].items.push(publicItem);
    });

    const result = Object.values(grouped);

    res.json(result);
  } catch (err) {
    console.error("Error loading public menu:", err);
    res.status(500).json({ error: "Failed to load public menu" });
  }
};

// PATCH /menu/items/:id/toggle-dynamic-pricing — toggle dynamicPricingEnabled
export const toggleMenuItemDynamicPricing = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { id } = req.params;
    if (!user || user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can modify menu items" });
      return;
    }
    const repo = AppDataSource.getRepository(MenuItem);
    const item = await repo.findOne({ where: { id } });
    if (!item || item.clubId !== user.clubId) {
      res.status(403).json({ error: "Item not found or not owned by your club" });
      return;
    }
    if (item.hasVariants) {
      res.status(400).json({ error: "Cannot toggle dynamic pricing on menu items with variants. Use the variant toggle instead." });
      return;
    }
    item.dynamicPricingEnabled = !item.dynamicPricingEnabled;
    await repo.save(item);
    res.json({ message: "Menu item dynamic pricing toggled", dynamicPricingEnabled: item.dynamicPricingEnabled });
  } catch (err) {
    console.error("Error toggling menu item dynamic pricing:", err);
    res.status(500).json({ error: "Server error toggling dynamic pricing" });
  }
};

