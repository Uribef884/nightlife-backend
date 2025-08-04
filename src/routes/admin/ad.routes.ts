import { Router } from 'express';
import { authMiddleware, requireAdminAuth } from '../../middlewares/authMiddleware';
import { upload } from '../../middlewares/uploadMiddleware';
import {
  createAdminAdGlobal,
  createClubAd,
  updateAd,
  deleteAd,
  getGlobalAds,
  getClubAds,
  getGlobalAdsAdmin,
  getClubAdsAdmin
} from '../../controllers/ad.controller';

const router = Router();

// Admin routes for managing ads
router.post('/global', authMiddleware, requireAdminAuth, upload.single('image'), createAdminAdGlobal);
router.post('/club/:clubId', authMiddleware, requireAdminAuth, upload.single('image'), createClubAd);
router.put('/:id', authMiddleware, requireAdminAuth, upload.single('image'), updateAd);
router.delete('/:id', authMiddleware, requireAdminAuth, deleteAd);
router.get('/global', authMiddleware, requireAdminAuth, getGlobalAdsAdmin);
router.get('/club/:clubId', authMiddleware, requireAdminAuth, getClubAdsAdmin);

export default router; 