import { Router } from "express";
import {
  createMenuItemAdmin,
  updateMenuItemAdmin,
  updateMenuItemImageAdmin,
  deleteMenuItemAdmin,
  getMenuItemByIdAdmin,
  getMenuForClubAdmin,
  toggleMenuItemDynamicPricingAdmin
} from "../../controllers/admin/menuItem.controller";
import { authMiddleware, requireAdminAuth } from "../../middlewares/authMiddleware";
import { upload } from "../../middlewares/uploadMiddleware";

const router = Router();

// Admin routes for managing menu items for any club
router.get("/club/:clubId", authMiddleware, requireAdminAuth, getMenuForClubAdmin);
router.get("/:id", authMiddleware, requireAdminAuth, getMenuItemByIdAdmin);
router.post("/club/:clubId", authMiddleware, requireAdminAuth, upload.single('image'), createMenuItemAdmin);
router.patch("/:id", authMiddleware, requireAdminAuth, updateMenuItemAdmin);
router.patch("/:id/image", authMiddleware, requireAdminAuth, upload.single('image'), updateMenuItemImageAdmin);
router.delete("/:id", authMiddleware, requireAdminAuth, deleteMenuItemAdmin);
router.patch('/:id/toggle-dynamic-pricing', authMiddleware, requireAdminAuth, toggleMenuItemDynamicPricingAdmin);

export default router; 