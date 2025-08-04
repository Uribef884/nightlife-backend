import { Request, Response } from "express";
import { AppDataSource } from "../../config/data-source";
import { MenuItem } from "../../entities/MenuItem";
import { AuthenticatedRequest } from "../../types/express";
import { validateImageUrlWithResponse } from "../../utils/validateImageUrl";
import { sanitizeInput, sanitizeObject } from "../../utils/sanitizeInput";
import { S3Service } from "../../services/s3Service";
import { ImageService } from "../../services/imageService";

// Admin function to get menu for a specific club
export const getMenuForClubAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { clubId } = req.params;
    const menuItemRepo = AppDataSource.getRepository(MenuItem);
    
    const menuItems = await menuItemRepo.find({
      where: { clubId, isActive: true, isDeleted: false },
      relations: ["category", "variants"],
      order: { name: "ASC" }
    });

    res.status(200).json(menuItems);
  } catch (error) {
    console.error("❌ Error fetching menu for club:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to get menu item by ID
export const getMenuItemByIdAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const menuItemRepo = AppDataSource.getRepository(MenuItem);
    const { id } = req.params;
    
    const menuItem = await menuItemRepo.findOne({ 
      where: { id, isDeleted: false }, 
      relations: ["category", "variants"] 
    });

    if (!menuItem) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }

    res.status(200).json(menuItem);
  } catch (error) {
    console.error("❌ Error fetching menu item:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to create menu item for a specific club
export const createMenuItemAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { clubId } = req.params;
    
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

    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    if (!categoryId) {
      res.status(400).json({ error: "Category ID is required" });
      return;
    }

    // Validate image file
    if (!req.file) {
      res.status(400).json({ error: "Image file is required." });
      return;
    }

    if (hasVariantsBool && priceNum !== null && priceNum !== undefined) {
      res.status(400).json({ error: "Price must be null when hasVariants is true" });
      return;
    }

    if (!hasVariantsBool && (typeof priceNum !== "number" || priceNum <= 0)) {
      res.status(400).json({ error: "Price must be a positive number (greater than 0) if hasVariants is false" });
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

    // Process image
    const processed = await ImageService.processImage(req.file.buffer);

    // Create menu item
    const menuItemRepo = AppDataSource.getRepository(MenuItem);
    const newMenuItem = menuItemRepo.create({
      name: name.trim(),
      description: description?.trim() || null,
      price: hasVariantsBool ? undefined : priceNum,
      maxPerPerson: hasVariantsBool ? undefined : maxPerPersonNum,
      hasVariants: hasVariantsBool,
      dynamicPricingEnabled: dynamicPricingEnabledBool,
      categoryId,
      clubId: clubId,
      imageUrl: "", // will be set after upload
      imageBlurhash: processed.blurhash,
      isActive: true,
    });

    await menuItemRepo.save(newMenuItem);

    // Upload image to S3
    const key = S3Service.generateKey(clubId, 'menu-item');
    const uploadResult = await S3Service.uploadFile(processed.buffer, 'image/jpeg', key);
    
    // Update menu item with image URL
    newMenuItem.imageUrl = uploadResult.url;
    await menuItemRepo.save(newMenuItem);

    res.status(201).json(newMenuItem);
  } catch (error) {
    console.error("❌ Error creating menu item:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to update menu item
export const updateMenuItemAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const menuItemId = req.params.id;
    const menuItemRepo = AppDataSource.getRepository(MenuItem);

    const menuItem = await menuItemRepo.findOne({ where: { id: menuItemId } });
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

    // Sanitize inputs
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

    if (typeof hasVariants === "boolean" && hasVariants !== menuItem.hasVariants) {
      res.status(400).json({ error: "Cannot change hasVariants after item creation" });
      return;
    }

    if (typeof name === "string") {
      const sanitizedName = sanitizeInput(name);
      if (!sanitizedName) {
        res.status(400).json({ error: "Name is required" });
        return;
      }
      menuItem.name = sanitizedName;
    }

    if (typeof description === "string") {
      menuItem.description = sanitizeInput(description) ?? undefined;
    }

    if (typeof imageUrl === "string") {
      menuItem.imageUrl = imageUrl;
    }

    // Parse boolean values from form data for validation
    const hasVariantsBool = menuItem.hasVariants;
    const priceNum = price && price !== "" ? Number(price) : undefined;
    const maxPerPersonNum = maxPerPerson && maxPerPerson !== "" ? Number(maxPerPerson) : undefined;

    // Only validate price if it's provided in the request
    if (price !== undefined) {
      if (hasVariantsBool && priceNum !== null && priceNum !== undefined) {
        res.status(400).json({ error: "Price must be null when hasVariants is true" });
        return;
      }

      if (!hasVariantsBool && (typeof priceNum !== "number" || priceNum <= 0)) {
        res.status(400).json({ error: "Price must be a positive number (greater than 0) if hasVariants is false" });
        return;
      }
    }

    // Only validate maxPerPerson if it's provided in the request
    if (maxPerPerson !== undefined) {
      if (hasVariantsBool && maxPerPersonNum !== null && maxPerPersonNum !== undefined) {
        res.status(400).json({ error: "maxPerPerson must be null when hasVariants is true" });
        return;
      }

      if (!hasVariantsBool && (typeof maxPerPersonNum !== "number" || maxPerPersonNum <= 0)) {
        res.status(400).json({ error: "maxPerPerson must be a positive number if hasVariants is false" });
        return;
      }
    }

    // Update price if provided and valid
    if (price !== undefined) {
      if (hasVariantsBool) {
        menuItem.price = undefined;
      } else {
        menuItem.price = priceNum;
      }
    }

    // Update maxPerPerson if provided and valid
    if (maxPerPerson !== undefined) {
      if (hasVariantsBool) {
        menuItem.maxPerPerson = undefined;
      } else {
        menuItem.maxPerPerson = maxPerPersonNum;
      }
    }

    if (dynamicPricingEnabled !== undefined) {
      // Enforce that parent menu items with variants cannot have dynamic pricing enabled
      if (menuItem.hasVariants && dynamicPricingEnabled) {
        res.status(400).json({ 
          error: "Parent menu items with variants cannot have dynamic pricing enabled. Dynamic pricing should be configured on individual variants instead." 
        });
        return;
      }
      menuItem.dynamicPricingEnabled = !!dynamicPricingEnabled;
    }

    await menuItemRepo.save(menuItem);
    res.status(200).json(menuItem);
  } catch (error) {
    console.error("❌ Error updating menu item:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to delete menu item
export const deleteMenuItemAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const menuItemId = req.params.id;
    const menuItemRepo = AppDataSource.getRepository(MenuItem);

    const menuItem = await menuItemRepo.findOne({ where: { id: menuItemId } });
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

    menuItem.isDeleted = true;
    await menuItemRepo.save(menuItem);

    res.status(200).json({ message: "Menu item deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting menu item:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to toggle menu item dynamic pricing
export const toggleMenuItemDynamicPricingAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const menuItemId = req.params.id;
    const menuItemRepo = AppDataSource.getRepository(MenuItem);

    const menuItem = await menuItemRepo.findOne({ where: { id: menuItemId } });
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

    // Reject if the menu item has variants
    if (menuItem.hasVariants) {
      res.status(400).json({ 
        error: "Parent menu items with variants cannot have dynamic pricing enabled. Dynamic pricing should be configured on individual variants instead." 
      });
      return;
    }

    menuItem.dynamicPricingEnabled = !menuItem.dynamicPricingEnabled;
    await menuItemRepo.save(menuItem);

    res.status(200).json({ dynamicPricingEnabled: menuItem.dynamicPricingEnabled });
  } catch (error) {
    console.error("❌ Error toggling menu item dynamic pricing:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin function to update menu item image
export const updateMenuItemImageAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const file = req.file!; // Guaranteed to exist due to middleware validation

    // Verify menu item exists
    const itemRepo = AppDataSource.getRepository(MenuItem);
    const item = await itemRepo.findOne({ where: { id } });

    if (!item) {
      res.status(404).json({ error: 'Menu item not found' });
      return;
    }

    // ❌ Validate that menu item belongs to the expected club
    const expectedClubId = req.params.clubId;
    if (item.clubId !== expectedClubId) {
      res.status(403).json({ 
        error: `Menu item '${item.name}' does not belong to the specified club` 
      });
      return;
    }

    // Store reference to old image for deletion after successful upload
    const oldImageUrl = item.imageUrl;

    // Process image
    const processed = await ImageService.processImage(file.buffer);
    
    // Generate unique key with timestamp to ensure new URL
    const timestamp = Date.now();
    const key = S3Service.generateKey(item.clubId, 'menu-item-image', `${id}-${timestamp}`);
    const uploadResult = await S3Service.uploadFile(
      processed.buffer,
      'image/jpeg',
      key
    );

    // Update menu item
    item.imageUrl = uploadResult.url;
    item.imageBlurhash = processed.blurhash;
    await itemRepo.save(item);

    // Delete old image from S3 if upload and DB update were successful
    // Only delete if the URLs are different (same key = same URL = no deletion needed)
    if (oldImageUrl && oldImageUrl !== uploadResult.url) {
      try {
        // Parse the S3 URL to extract the key
        const url = new URL(oldImageUrl);
        const oldKey = url.pathname.substring(1); // Remove leading slash
        
        await S3Service.deleteFile(oldKey);
      } catch (deleteError) {
        console.error('⚠️ Warning: Failed to delete old menu item image from S3:', deleteError);
        // Don't fail the request - new image is already uploaded successfully
      }
    }

    res.json({
      message: 'Menu item image uploaded successfully',
      imageUrl: uploadResult.url,
      blurhash: processed.blurhash,
      itemId: item.id
    });
  } catch (error) {
    console.error('Error uploading menu item image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
}; 