import { Router } from 'express';
import { authMiddleware, requireAdminAuth } from '../../middlewares/authMiddleware';
import { upload, validatePdfUpload, validateImageUpload, handleMulterError } from '../../middlewares/uploadMiddleware';
import { 
  uploadMenuPdf, 
  removePdfMenu,
  uploadClubProfileImage,
  uploadMenuItemImage,
  uploadEventBanner,
  uploadAdImage
} from '../../controllers/fileUpload.controller';

const router = Router();

// All routes require admin authentication
router.use(authMiddleware);
router.use(requireAdminAuth);

// Admin PDF menu upload and removal for specific clubs
router.post('/club/:clubId/menu/pdf', upload.single('pdf'), handleMulterError, validatePdfUpload, uploadMenuPdf);
router.delete('/club/:clubId/menu/pdf', removePdfMenu);

// Admin image uploads for specific clubs
router.post('/club/:clubId/profile-image', upload.single('image'), handleMulterError, validateImageUpload, uploadClubProfileImage);
router.post('/club/:clubId/menu-item/:menuItemId/image', upload.single('image'), handleMulterError, validateImageUpload, uploadMenuItemImage);
router.post('/club/:clubId/event/:eventId/banner', upload.single('image'), handleMulterError, validateImageUpload, uploadEventBanner);
router.post('/club/:clubId/ad/:adId/image', upload.single('image'), handleMulterError, validateImageUpload, uploadAdImage);

export default router; 