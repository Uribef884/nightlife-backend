import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware';
import { upload } from '../middlewares/uploadMiddleware';
import {
  createAdminAd,
  createClubAd,
  updateAd,
  deleteAd,
  getGlobalAds,
  getClubAds,
  getMyClubAds
} from '../controllers/ad.controller';
import { isAdmin } from '../middlewares/isAdmin';
import { requireBouncerOrClubOwner } from '../middlewares/requireBouncerOrClubOwner';

const router = Router();

// POST /ads/global (admin, multipart/form-data)
router.post('/global', authMiddleware, isAdmin, upload.single('image'), createAdminAd);

// POST /ads/club (club owner, multipart/form-data)
router.post('/club', authMiddleware, upload.single('image'), createClubAd);

// PUT /ads/:id (admin/club owner, multipart/form-data for image update)
router.put('/:id', authMiddleware, upload.single('image'), updateAd);

// DELETE /ads/:id (admin/club owner, also deletes from S3)
router.delete('/:id', authMiddleware, deleteAd);

// GET /ads/global (public)
router.get('/global', getGlobalAds);

// GET /ads/club/:clubId (public)
router.get('/club/:clubId', getClubAds);

// GET /ads/my-club (club owner)
router.get('/my-club', authMiddleware, getMyClubAds);

export default router; 