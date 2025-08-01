import { Response } from 'express';
import { AuthenticatedRequest } from '../types/express';
import { S3Service } from '../services/s3Service';
import { ImageService } from '../services/imageService';
import { AppDataSource } from '../config/data-source';
import { Club } from '../entities/Club';
import { MenuItem } from '../entities/MenuItem';
import { Event } from '../entities/Event';
import { Ad } from "../entities/Ad";
import { validateImageUrlWithResponse } from '../utils/validateImageUrl';

// Upload menu PDF
export const uploadMenuPdf = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const file = req.file!; // Guaranteed to exist due to middleware validation

    // File validation is handled by middleware

    // Only club owners can upload PDF menu
    if (user.role !== "admin" && user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can upload PDF menu" });
      return;
    }

    if (!user.clubId) {
      res.status(400).json({ error: 'User not associated with any club' });
      return;
    }

    // Get club info first to check current PDF and validate
    const clubRepo = AppDataSource.getRepository(Club);
    const club = await clubRepo.findOne({ where: { id: user.clubId } });
    
    if (!club) {
      res.status(404).json({ error: 'Club not found' });
      return;
    }

    // Check if club is in PDF mode
    if (club.menuType !== "pdf") {
      res.status(400).json({ 
        error: "Club must be in PDF menu mode to upload PDF. Switch to PDF mode first." 
      });
      return;
    }

    // Store reference to old PDF for deletion after successful upload
    const oldPdfUrl = club.pdfMenuUrl;

    // Upload new PDF
    const key = S3Service.generateKey(user.clubId, 'menu-pdf');
    
    const uploadResult = await S3Service.uploadFile(
      file.buffer,
      file.mimetype,
      key
    );

    // Update club with new PDF URL
    club.pdfMenuUrl = uploadResult.url;
    club.pdfMenuName = file.originalname;
    await clubRepo.save(club);

    // Delete old PDF from S3 if upload and DB update were successful
    // Skip deletion if old and new URLs are the same (same S3 key, file was overwritten)
    if (oldPdfUrl && oldPdfUrl !== uploadResult.url) {
      try {
        // Parse the S3 URL to extract the key
        const url = new URL(oldPdfUrl);
        const oldKey = url.pathname.substring(1); // Remove leading slash
        
        await S3Service.deleteFile(oldKey);
      } catch (deleteError) {
        console.error('⚠️ Warning: Failed to delete old PDF from S3:', deleteError);
        // Don't fail the request - new PDF is already uploaded successfully
      }
    } else if (oldPdfUrl === uploadResult.url) {
      console.log(`⏭️ Skipping deletion - old and new URLs are identical (file was overwritten)`);
    }

    res.json({
      message: 'PDF menu uploaded successfully',
      pdfMenuUrl: uploadResult.url,
      pdfMenuName: file.originalname,
      size: uploadResult.size
    });
  } catch (error) {
    console.error('Error uploading PDF:', error);
    res.status(500).json({ error: 'Failed to upload PDF' });
  }
};

// Remove PDF menu
export const removePdfMenu = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    // Only club owners can remove PDF menu
    if (user.role !== "admin" && user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can remove PDF menu" });
      return;
    }

    if (!user.clubId) {
      res.status(400).json({ error: 'User not associated with any club' });
      return;
    }

    const clubRepo = AppDataSource.getRepository(Club);
    const club = await clubRepo.findOne({ where: { id: user.clubId } });

    if (!club) {
      res.status(404).json({ error: 'Club not found' });
      return;
    }

    if (!club.pdfMenuUrl) {
      res.status(404).json({ error: 'No PDF menu to remove' });
      return;
    }

    // Extract S3 key from URL to delete from S3
    try {
      // Parse the S3 URL to extract the key
      // URL format: https://bucket-name.s3.region.amazonaws.com/key/path
      const url = new URL(club.pdfMenuUrl);
      const key = url.pathname.substring(1); // Remove leading slash
      
      // Delete from S3
      await S3Service.deleteFile(key);
    } catch (s3Error) {
      console.error('Error deleting file from S3:', s3Error);
      // Continue with database cleanup even if S3 deletion fails
    }

    // Clear PDF menu info from database - use update to explicitly set NULL
    await clubRepo.update(club.id, {
      pdfMenuUrl: null as any,
      pdfMenuName: null as any
    });

    res.json({
      message: 'PDF menu removed successfully'
    });
  } catch (error) {
    console.error('Error removing PDF menu:', error);
    res.status(500).json({ error: 'Failed to remove PDF menu' });
  }
};

// Upload club profile image
export const uploadClubProfileImage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const file = req.file!; // Guaranteed to exist due to middleware validation

    // Only club owners can upload profile image
    if (user.role !== "admin" && user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can upload profile image" });
      return;
    }

    if (!user.clubId) {
      res.status(400).json({ error: 'User not associated with any club' });
      return;
    }

    // Get club info first to check current image
    const clubRepo = AppDataSource.getRepository(Club);
    const club = await clubRepo.findOne({ where: { id: user.clubId } });
    
    if (!club) {
      res.status(404).json({ error: 'Club not found' });
      return;
    }

    // Store reference to old image for deletion after successful upload
    const oldImageUrl = club.profileImageUrl;

    // Process image and generate BlurHash
    const processed = await ImageService.processImage(file.buffer);
    
    const key = S3Service.generateKey(user.clubId, 'profile-image');
    const uploadResult = await S3Service.uploadFile(
      processed.buffer,
      'image/jpeg',
      key
    );

    // Update club with new image
    club.profileImageUrl = uploadResult.url;
    club.profileImageBlurhash = processed.blurhash;
    await clubRepo.save(club);

    // Delete old image from S3 if upload and DB update were successful
    if (oldImageUrl) {
      try {
        // Parse the S3 URL to extract the key
        const url = new URL(oldImageUrl);
        const oldKey = url.pathname.substring(1); // Remove leading slash
        
        console.log(`🗑️ Attempting to delete old profile image with key: ${oldKey}`);
        await S3Service.deleteFile(oldKey);
        console.log(`✅ Deleted old profile image: ${oldKey}`);
      } catch (deleteError) {
        console.error('⚠️ Warning: Failed to delete old profile image from S3:', deleteError);
        // Don't fail the request - new image is already uploaded successfully
      }
    }

    res.json({
      message: 'Profile image uploaded successfully',
      imageUrl: uploadResult.url,
      blurhash: processed.blurhash,
      width: processed.width,
      height: processed.height
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
};

// Upload menu item image
export const uploadMenuItemImage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { itemId } = req.params;
    const file = req.file!; // Guaranteed to exist due to middleware validation

    // Only club owners can upload menu item images
    if (user.role !== "admin" && user.role !== "clubowner") {
      res.status(403).json({ error: "Only club owners can upload menu item images" });
      return;
    }

    // Verify menu item ownership
    const itemRepo = AppDataSource.getRepository(MenuItem);
    const item = await itemRepo.findOne({ where: { id: itemId } });

    if (!item || item.clubId !== user.clubId) {
      res.status(404).json({ error: 'Menu item not found or unauthorized' });
      return;
    }

    // Store reference to old image for deletion after successful upload
    const oldImageUrl = item.imageUrl;

    // Process image
    const processed = await ImageService.processImage(file.buffer);
    
    const key = S3Service.generateKey(item.clubId, 'menu-item-image', itemId);
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

// Upload event banner image
export const uploadEventBanner = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { eventId } = req.params;
    const file = req.file!; // Guaranteed to exist due to middleware validation


    // Only club owners can upload event banners
    if (user.role !== "admin" && user.role !== "clubowner") {
      console.log('❌ Access denied - user role:', user.role);
      res.status(403).json({ error: "Only club owners can upload event banners" });
      return;
    }


    // Verify event ownership
    const eventRepo = AppDataSource.getRepository(Event);
    const event = await eventRepo.findOne({ where: { id: eventId } });


    if (!event || event.clubId !== user.clubId) {
      console.log('❌ Event not found or unauthorized');
      res.status(404).json({ error: 'Event not found or unauthorized' });
      return;
    }

    // Store reference to old banner for deletion after successful upload
    const oldBannerUrl = event.bannerUrl;

    // Process image
    const processed = await ImageService.processImage(file.buffer);

    const key = S3Service.generateKey(event.clubId, 'event-banner', eventId);

    

    const uploadResult = await S3Service.uploadFile(
      processed.buffer,
      'image/jpeg',
      key
    );


    // Update event
    event.bannerUrl = uploadResult.url;
    event.BannerURLBlurHash = processed.blurhash;
    await eventRepo.save(event);

    // Delete old banner from S3 if upload and DB update were successful
    // Only delete if the URLs are different (same key = same URL = no deletion needed)
    if (oldBannerUrl && oldBannerUrl !== uploadResult.url) {
      try {
        // Parse the S3 URL to extract the key
        const url = new URL(oldBannerUrl);
        const oldKey = url.pathname.substring(1); // Remove leading slash
        
        await S3Service.deleteFile(oldKey);
      } catch (deleteError) {
        console.error('⚠️ Warning: Failed to delete old event banner from S3:', deleteError);
        // Don't fail the request - new banner is already uploaded successfully
      }
    } else if (oldBannerUrl === uploadResult.url) {
      console.log('⏭️ Skipping deletion - old and new URLs are identical (file was overwritten)');
    }

  } catch (error) {
    console.error('❌ Error uploading event banner:', error);
    res.status(500).json({ error: 'Failed to upload event banner' });
  }
};

// Upload ad image (admin or club ad)
export const uploadAdImage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { adId } = req.params;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No image file uploaded." });
      return ;
    }

    // Find the ad
    const adRepo = AppDataSource.getRepository(Ad);
    const ad = await adRepo.findOne({ where: { id: adId } });
    if (!ad) {
      res.status(404).json({ error: "Ad not found." });
      return;
    }

    // Permission check
    if (!ad.clubId && user.role !== "admin") {
      res.status(403).json({ error: "Only admins can upload images for admin ads." });
      return ;
    }
    if (ad.clubId && (user.role !== "clubowner" || user.clubId !== ad.clubId)) {
      res.status(403).json({ error: "Only the club owner can upload images for this ad." });
      return;
    }

    // Store old image URL for safe deletion
    const oldImageUrl = ad.imageUrl;

    // Process image and generate blurhash
    const processed = await ImageService.processImage(file.buffer);
    const key = S3Service.generateAdKey(ad);
    const uploadResult = await S3Service.uploadFile(
      processed.buffer,
      'image/jpeg',
      key
    );

    // Update ad with new image
    ad.imageUrl = uploadResult.url;
    ad.imageBlurhash = processed.blurhash;
    await adRepo.save(ad);

    // Safe deletion of old image
    await S3Service.deleteFileByUrl(oldImageUrl, ad.imageUrl);

    res.json({
      message: 'Ad image uploaded successfully',
      imageUrl: ad.imageUrl,
      blurhash: ad.imageBlurhash,
      adId: ad.id
    });
  } catch (error) {
    console.error('Error uploading ad image:', error);
    res.status(500).json({ error: 'Failed to upload ad image' });
  }
};

 