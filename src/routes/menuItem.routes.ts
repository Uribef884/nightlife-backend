import { Router } from "express";
import {
  createMenuItem,
  updateMenuItem,
  updateMenuItemImage,
  deleteMenuItem,
  getAllMenuItems,
  getMenuItemById,
  getItemsForMyClub,
  getMenuForClub,
  getPublicMenuForClub,
  toggleMenuItemDynamicPricing
} from "../controllers/menuItem.controller";
import { authMiddleware, requireClubOwnerOrAdmin } from "../middlewares/authMiddleware";
import { upload } from "../middlewares/uploadMiddleware";

const router = Router();

// Public routes
router.get("/all", getAllMenuItems);  //Returns all menu items across all clubs (only active items, with active variants).
router.get("/club/:clubId", getMenuForClub);
router.get("/club/:clubId/public", getPublicMenuForClub); // ✅ new route for grouped public menu
router.get("/:id", getMenuItemById);

// Clubowner routes
router.get("/my/items", authMiddleware, requireClubOwnerOrAdmin, getItemsForMyClub);
router.post("/", authMiddleware, requireClubOwnerOrAdmin, upload.single('image'), createMenuItem);
router.patch("/:id", authMiddleware, requireClubOwnerOrAdmin, updateMenuItem);
router.patch("/:id/image", authMiddleware, requireClubOwnerOrAdmin, upload.single('image'), updateMenuItemImage);
router.delete("/:id", authMiddleware, requireClubOwnerOrAdmin, deleteMenuItem);
router.patch('/:id/toggle-dynamic-pricing', authMiddleware, toggleMenuItemDynamicPricing);

export default router;