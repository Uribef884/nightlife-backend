import { Router } from "express";
import {
  getEventsByClubIdAdmin,
  createEventAdmin,
  updateEventAdmin,
  updateEventImageAdmin,
  toggleEventVisibilityAdmin,
  deleteEventAdmin,
} from "../../controllers/admin/event.controller";
import { authMiddleware, requireAdminAuth } from "../../middlewares/authMiddleware";
import { upload } from "../../middlewares/uploadMiddleware";
import { createLimiter } from "../../middlewares/rateLimiter";

const router = Router();

// Admin routes for managing events for any club
router.get("/club/:clubId", authMiddleware, requireAdminAuth, getEventsByClubIdAdmin);
router.post("/club/:clubId", createLimiter, authMiddleware, requireAdminAuth, upload.single('image'), createEventAdmin);
router.put("/:id", authMiddleware, requireAdminAuth, updateEventAdmin);
router.put("/:id/image", authMiddleware, requireAdminAuth, upload.single('image'), updateEventImageAdmin);
router.patch("/:id/toggle-visibility", authMiddleware, requireAdminAuth, toggleEventVisibilityAdmin);
router.delete("/:id", authMiddleware, requireAdminAuth, deleteEventAdmin);

export default router; 