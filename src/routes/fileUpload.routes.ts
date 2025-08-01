import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { upload, validatePdfUpload, validateImageUpload } from '../middlewares/uploadMiddleware';
import { 
  uploadMenuPdf, 
  removePdfMenu,
  uploadClubProfileImage,
  uploadMenuItemImage,
  uploadEventBanner,
  uploadAdImage
} from '../controllers/fileUpload.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// PDF menu upload and removal
router.post('/menu/pdf', upload.single('pdf'), validatePdfUpload, uploadMenuPdf);
router.delete('/menu/pdf', removePdfMenu);

// Club profile image
router.post('/club/profile-image', upload.single('image'), validateImageUpload, uploadClubProfileImage);

// Menu item image
router.post('/menu-item/:itemId/image', upload.single('image'), validateImageUpload, uploadMenuItemImage);

// Event banner image
router.post('/event/:eventId/banner', upload.single('image'), validateImageUpload, uploadEventBanner);

// Ad image upload
router.post('/ad/:adId/image', upload.single('image'), uploadAdImage);

export default router; 