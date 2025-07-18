import { Response } from 'express';
import { AuthenticatedRequest } from '../types/express';
import { S3Service } from '../services/s3Service';
import { ImageService } from '../services/imageService';
import { AppDataSource } from '../config/data-source';
import { Club } from '../entities/Club';
import { MenuItem } from '../entities/MenuItem';
import { Event } from '../entities/Event';

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
    if (oldPdfUrl) {
      try {
        const urlParts = oldPdfUrl.split('/');
        const oldKey = urlParts.slice(3).join('/'); // Remove https://bucket.s3.region.amazonaws.com/
        await S3Service.deleteFile(oldKey);
        console.log(`✅ Deleted old PDF: ${oldKey}`);
      } catch (deleteError) {
        console.error('⚠️ Warning: Failed to delete old PDF from S3:', deleteError);
        // Don't fail the request - new PDF is already uploaded successfully
      }
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
      const urlParts = club.pdfMenuUrl.split('/');
      const key = urlParts.slice(3).join('/'); // Remove https://bucket.s3.region.amazonaws.com/
      
      // Delete from S3
      await S3Service.deleteFile(key);
    } catch (s3Error) {
      console.error('Error deleting file from S3:', s3Error);
      // Continue with database cleanup even if S3 deletion fails
    }

    // Clear PDF menu info from database
    club.pdfMenuUrl = undefined;
    club.pdfMenuName = undefined;
    await clubRepo.save(club);

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
        const urlParts = oldImageUrl.split('/');
        const oldKey = urlParts.slice(3).join('/'); // Remove https://bucket.s3.region.amazonaws.com/
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
    if (oldImageUrl) {
      try {
        const urlParts = oldImageUrl.split('/');
        const oldKey = urlParts.slice(3).join('/'); // Remove https://bucket.s3.region.amazonaws.com/
        await S3Service.deleteFile(oldKey);
        console.log(`✅ Deleted old menu item image: ${oldKey}`);
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
      res.status(403).json({ error: "Only club owners can upload event banners" });
      return;
    }

    // Verify event ownership
    const eventRepo = AppDataSource.getRepository(Event);
    const event = await eventRepo.findOne({ where: { id: eventId } });

    if (!event || event.clubId !== user.clubId) {
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
    if (oldBannerUrl) {
      try {
        const urlParts = oldBannerUrl.split('/');
        const oldKey = urlParts.slice(3).join('/'); // Remove https://bucket.s3.region.amazonaws.com/
        await S3Service.deleteFile(oldKey);
        console.log(`✅ Deleted old event banner: ${oldKey}`);
      } catch (deleteError) {
        console.error('⚠️ Warning: Failed to delete old event banner from S3:', deleteError);
        // Don't fail the request - new banner is already uploaded successfully
      }
    }

    res.json({
      message: 'Event banner uploaded successfully',
      imageUrl: uploadResult.url,
      blurhash: processed.blurhash,
      eventId: event.id
    });
  } catch (error) {
    console.error('Error uploading event banner:', error);
    res.status(500).json({ error: 'Failed to upload event banner' });
  }
}; 