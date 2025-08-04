import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Ad } from "../entities/Ad";
import { Ticket } from "../entities/Ticket";
import { Event } from "../entities/Event";
import { S3Service } from "../services/s3Service";
import { AuthenticatedRequest } from "../types/express";
import { IsNull, In } from "typeorm";
import { TicketPurchase } from "../entities/TicketPurchase";
import { validateImageUrlWithResponse } from "../utils/validateImageUrl";

function buildAdLink(ad: Ad): string | null {
  if (ad.targetType === "event" && ad.targetId) {
    return `/clubs.html?event=${ad.targetId}`;
  }
  if (ad.targetType === "ticket" && ad.targetId) {
    return `/clubs.html?ticket=${ad.targetId}`;
  }
  return null;
}

function adToResponse(ad: Ad) {
  return {
    id: ad.id,
    clubId: ad.clubId,
    imageUrl: ad.imageUrl,
    imageBlurhash: ad.imageBlurhash,
    priority: ad.priority,
    isVisible: ad.isVisible,
    targetType: ad.targetType,
    targetId: ad.targetId,
    link: buildAdLink(ad),
    createdAt: ad.createdAt,
    updatedAt: ad.updatedAt,
  };
}

function validatePriority(priority: any): boolean {
  return Number.isInteger(priority) && priority >= 1;
}

function validateTargetType(type: any): boolean {
  return type === "event" || type === "ticket";
}

// --- CREATE ADMIN AD ---
export const createAdminAdGlobal = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Only admins can create admin ads." });
      return;
    }
    const { priority, isVisible, targetType, targetId } = req.body;
    // Validate priority
    const prio = priority !== undefined ? parseInt(priority) : 1;
    if (!validatePriority(prio)) {
      res.status(400).json({ error: "Priority must be a positive integer (min 1)." });
      return;
    }
    // Validate target
    let validatedTargetId: string | null = null;
    if (targetType) {
      if (!validateTargetType(targetType)) {
        res.status(400).json({ error: "targetType must be 'ticket' or 'event' if provided." });
        return;
      }
      if (!targetId) {
        res.status(400).json({ error: "targetId is required if targetType is provided." });
        return;
      }
      // Validate existence
      if (targetType === "ticket") {
        const ticket = await AppDataSource.getRepository(Ticket).findOne({ where: { id: targetId } });
        if (!ticket) {
          res.status(400).json({ error: "Target ticket not found." });
          return;
        }
      } else if (targetType === "event") {
        const event = await AppDataSource.getRepository(Event).findOne({ where: { id: targetId } });
        if (!event) {
          res.status(400).json({ error: "Target event not found." });
          return;
        }
      }
      validatedTargetId = targetId;
    }
    // Validate image
    if (!req.file) {
      res.status(400).json({ error: "Image file is required." });
      return;
    }
    const processed = await (await import("../services/imageService")).ImageService.processImage(req.file.buffer);
    // Create ad
    const adRepo = AppDataSource.getRepository(Ad);
    const ad = adRepo.create({
      clubId: undefined,
      imageUrl: "", // will be set after upload
      imageBlurhash: processed.blurhash,
      priority: prio,
      isVisible: isVisible !== undefined ? isVisible === "true" || isVisible === true : true,
      targetType: targetType || null,
      targetId: validatedTargetId,
    });
    await adRepo.save(ad);
    // Upload image
    const key = S3Service.generateAdKey(ad);
    const uploadResult = await S3Service.uploadFile(processed.buffer, 'image/jpeg', key);
    ad.imageUrl = uploadResult.url;
    await adRepo.save(ad);
    res.status(201).json(adToResponse(ad));
  } catch (error) {
    console.error("Error creating admin ad:", error);
    res.status(500).json({ error: "Failed to create admin ad." });
  }
};

// --- CREATE CLUB AD ---
export const createClubAd = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== "clubowner" && req.user?.role !== "admin") {
      res.status(403).json({ error: "Only club owners and admins can create club ads." });
      return;
    }
    const { priority, isVisible, targetType, targetId } = req.body;
    
    // Get clubId based on user role
    let clubId: string;
    
    if (req.user?.role === "admin") {
      // For admins, use the clubId from the URL parameters
      const paramClubId = req.params.clubId;
      if (!paramClubId) {
        res.status(400).json({ error: "clubId parameter is required for admin ad creation" });
        return;
      }
      clubId = paramClubId;
    } else {
      // For club owners, use their associated clubId
      if (!req.user?.clubId) {
        res.status(400).json({ error: "No clubId found for user." });
        return;
      }
      clubId = req.user.clubId;
    }
    // Rate limiting: max 7 ads per club
    const adRepo = AppDataSource.getRepository(Ad);
    const adCount = await adRepo.count({ where: { clubId } });
    if (adCount >= 7) {
      res.status(400).json({ error: "You have reached the maximum of 7 ads for your club. Please delete an existing ad before uploading a new one." });
      return;
    }
    // Validate priority
    const prio = priority !== undefined ? parseInt(priority) : 1;
    if (!validatePriority(prio)) {
      res.status(400).json({ error: "Priority must be a positive integer (min 1)." });
      return;
    }
    // Validate target
    let validatedTargetId: string | null = null;
    if (targetType) {
      if (!validateTargetType(targetType)) {
        res.status(400).json({ error: "targetType must be 'ticket' or 'event' if provided." });
        return;
      }
      if (!targetId) {
        res.status(400).json({ error: "targetId is required if targetType is provided." });
        return;
      }
      // Validate existence and club ownership
      if (targetType === "ticket") {
        const ticket = await AppDataSource.getRepository(Ticket).findOne({ where: { id: targetId, clubId } });
        if (!ticket) {
          res.status(400).json({ error: "Target ticket not found or not owned by your club." });
          return;
        }
      } else if (targetType === "event") {
        const event = await AppDataSource.getRepository(Event).findOne({ where: { id: targetId, clubId } });
        if (!event) {
          res.status(400).json({ error: "Target event not found or not owned by your club." });
          return;
        }
      }
      validatedTargetId = targetId;
    }
    // Validate image
    if (!req.file) {
      res.status(400).json({ error: "Image file is required." });
      return;
    }
    const processed = await (await import("../services/imageService")).ImageService.processImage(req.file.buffer);
    // Create ad
    const ad = adRepo.create({
      clubId,
      imageUrl: "", // will be set after upload
      imageBlurhash: processed.blurhash,
      priority: prio,
      isVisible: isVisible !== undefined ? isVisible === "true" || isVisible === true : true,
      targetType: targetType || null,
      targetId: validatedTargetId,
    });
    await adRepo.save(ad);
    // Upload image
    const key = S3Service.generateAdKey(ad);
    const uploadResult = await S3Service.uploadFile(processed.buffer, 'image/jpeg', key);
    ad.imageUrl = uploadResult.url;
    await adRepo.save(ad);
    res.status(201).json(adToResponse(ad));
  } catch (error) {
    console.error("Error creating club ad:", error);
    res.status(500).json({ error: "Failed to create club ad." });
  }
};

// --- UPDATE AD ---
export const updateAd = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adRepo = AppDataSource.getRepository(Ad);
    const ad = await adRepo.findOne({ where: { id, isActive: true, isDeleted: false } });
    if (!ad) {
      res.status(404).json({ error: "Ad not found." });
      return;
    }
    // Permission check
    if (!ad.clubId && req.user?.role !== "admin") {
      res.status(403).json({ error: "Only admins can update admin ads." });
      return;
    }
    if (ad.clubId && req.user?.role === "clubowner" && req.user.clubId !== ad.clubId) {
      res.status(403).json({ error: "Only the club owner can update this ad." });
      return;
    }
    if (ad.clubId && req.user?.role !== "clubowner" && req.user?.role !== "admin") {
      res.status(403).json({ error: "Only club owners and admins can update club ads." });
      return;
    }
    // Update fields
    const { priority, isVisible, targetType, targetId, imageUrl } = req.body;

    // Validate image URL if provided
    if (imageUrl && !validateImageUrlWithResponse(imageUrl, res)) {
      return;
    }
    if (priority !== undefined) {
      const prio = parseInt(priority);
      if (!validatePriority(prio)) {
        res.status(400).json({ error: "Priority must be a positive integer (min 1)." });
        return;
      }
      ad.priority = prio;
    }
    if (isVisible !== undefined) {
      ad.isVisible = isVisible === "true" || isVisible === true;
    }
    // Target validation - targetType and targetId cannot be changed once created
    if (targetType !== undefined || targetId !== undefined) {
      res.status(400).json({ 
        error: "targetType and targetId cannot be modified after ad creation. Please delete the ad and create a new one if you need to change the target." 
      });
      return;
    }
    // Image update (optional)
    if (req.file) {
      const processed = await (await import("../services/imageService")).ImageService.processImage(req.file.buffer);
      const oldImageUrl = ad.imageUrl;
      const key = S3Service.generateAdKey(ad);
      const uploadResult = await S3Service.uploadFile(processed.buffer, 'image/jpeg', key);
      ad.imageUrl = uploadResult.url;
      ad.imageBlurhash = processed.blurhash;
      await S3Service.deleteFileByUrl(oldImageUrl, ad.imageUrl);
    }
    await adRepo.save(ad);
    res.json(adToResponse(ad));
  } catch (error) {
    console.error("Error updating ad:", error);
    res.status(500).json({ error: "Failed to update ad." });
  }
};

// --- DELETE AD ---
export const deleteAd = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adRepo = AppDataSource.getRepository(Ad);
    const ad = await adRepo.findOne({ where: { id, isActive: true, isDeleted: false } });
    if (!ad) {
      res.status(404).json({ error: "Ad not found." });
      return;
    }
    // Permission check
    if (!ad.clubId && req.user?.role !== "admin") {
      res.status(403).json({ error: "Only admins can delete admin ads." });
      return;
    }
    if (ad.clubId && req.user?.role === "clubowner" && req.user.clubId !== ad.clubId) {
      res.status(403).json({ error: "Only the club owner can delete this ad." });
      return;
    }
    if (ad.clubId && req.user?.role !== "clubowner" && req.user?.role !== "admin") {
      res.status(403).json({ error: "Only club owners and admins can delete club ads." });
      return;
    }

    // Check if ad has any related purchases (tickets or events)
    let hasRelatedPurchases = false;
    
    if (ad.targetType === "ticket" && ad.targetId) {
      // Check if the targeted ticket has purchases
      const ticketPurchaseRepo = AppDataSource.getRepository(TicketPurchase);
      const purchaseCount = await ticketPurchaseRepo.count({
        where: { ticketId: ad.targetId }
      });
      hasRelatedPurchases = purchaseCount > 0;
    } else if (ad.targetType === "event" && ad.targetId) {
      // Check if the targeted event has tickets with purchases
      const ticketRepo = AppDataSource.getRepository(Ticket);
      const ticketPurchaseRepo = AppDataSource.getRepository(TicketPurchase);
      
      const eventTickets = await ticketRepo.find({ where: { eventId: ad.targetId } });
      const ticketIds = eventTickets.map(ticket => ticket.id);
      
      if (ticketIds.length > 0) {
        const purchaseCount = await ticketPurchaseRepo.count({
          where: { ticketId: In(ticketIds) }
        });
        hasRelatedPurchases = purchaseCount > 0;
      }
    }

    if (hasRelatedPurchases) {
      // Soft delete - mark as deleted but keep the record
      ad.isDeleted = true;
      ad.deletedAt = new Date();
      ad.isActive = false; // Also deactivate to prevent new usage
      await adRepo.save(ad);

      res.json({ 
        message: "Ad soft deleted successfully", 
        deletedAt: ad.deletedAt,
        hasRelatedPurchases,
        note: "Ad marked as deleted but preserved due to existing purchases"
      });
    } else {
      // Hard delete - no related purchases, safe to completely remove
      // Delete image from S3
      try {
        await S3Service.deleteFileByUrl(ad.imageUrl);
      } catch (err) {
        console.error("Error deleting ad image from S3:", err);
      }
      // Delete ad from DB
      await adRepo.remove(ad);
      res.json({ 
        message: "Ad permanently deleted successfully",
        note: "No related purchases found, ad completely removed"
      });
    }
  } catch (error) {
    console.error("Error deleting ad:", error);
    res.status(500).json({ error: "Failed to delete ad." });
  }
};

// --- GET GLOBAL ADS ---
export const getGlobalAds = async (req: Request, res: Response): Promise<void> => {
  try {
    const adRepo = AppDataSource.getRepository(Ad);
    const ads = await adRepo.find({ 
      where: { clubId: IsNull(), isActive: true, isDeleted: false }, 
      order: { priority: "DESC", createdAt: "DESC" } 
    });
    res.json(ads.map(adToResponse));
  } catch (error) {
    console.error("Error fetching global ads:", error);
    res.status(500).json({ error: "Failed to fetch global ads." });
  }
};

// --- GET CLUB ADS ---
export const getClubAds = async (req: Request, res: Response): Promise<void> => {
  try {
    const { clubId } = req.params;
    const adRepo = AppDataSource.getRepository(Ad);
    const ads = await adRepo.find({ 
      where: { clubId, isActive: true, isDeleted: false }, 
      order: { priority: "DESC", createdAt: "DESC" } 
    });
    res.json(ads.map(adToResponse));
  } catch (error) {
    console.error("Error fetching club ads:", error);
    res.status(500).json({ error: "Failed to fetch club ads." });
  }
};

// --- GET MY CLUB ADS ---
export const getMyClubAds = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can view their ads." });
      return;
    }
    const clubId = req.user.clubId;
    if (!clubId) {
      res.status(400).json({ error: "No clubId found for user." });
      return;
    }
    const adRepo = AppDataSource.getRepository(Ad);
    const ads = await adRepo.find({ 
      where: { clubId, isDeleted: false }, 
      order: { priority: "DESC", createdAt: "DESC" } 
    });
    res.json(ads.map(adToResponse));
  } catch (error) {
    console.error("Error fetching my club ads:", error);
    res.status(500).json({ error: "Failed to fetch my club ads." });
  }
};

// --- GET GLOBAL ADS (ADMIN) ---
export const getGlobalAdsAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Only admins can view all global ads." });
      return;
    }
    const adRepo = AppDataSource.getRepository(Ad);
    const ads = await adRepo.find({ 
      where: { clubId: IsNull() }, 
      order: { priority: "DESC", createdAt: "DESC" } 
    });
    res.json(ads.map(adToResponse));
  } catch (error) {
    console.error("Error fetching global ads (admin):", error);
    res.status(500).json({ error: "Failed to fetch global ads." });
  }
};

// --- GET CLUB ADS (ADMIN) ---
export const getClubAdsAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Only admins can view all club ads." });
      return;
    }
    const { clubId } = req.params;
    if (!clubId) {
      res.status(400).json({ error: "clubId parameter is required" });
      return;
    }
    const adRepo = AppDataSource.getRepository(Ad);
    const ads = await adRepo.find({ 
      where: { clubId }, 
      order: { priority: "DESC", createdAt: "DESC" } 
    });
    res.json(ads.map(adToResponse));
  } catch (error) {
    console.error("Error fetching club ads (admin):", error);
    res.status(500).json({ error: "Failed to fetch club ads." });
  }
}; 