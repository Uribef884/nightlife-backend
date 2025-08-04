import { Router } from "express";
import {
  getVariantsByMenuItemIdAdmin,
  createMenuItemVariantAdmin,
  updateMenuItemVariantAdmin,
  deleteMenuItemVariantAdmin,
  toggleMenuItemVariantDynamicPricingAdmin
} from "../../controllers/admin/menuVariant.controller";
import { authMiddleware, requireAdminAuth } from "../../middlewares/authMiddleware";

const router = Router();

// Admin routes for managing menu variants
router.get("/:menuItemId", authMiddleware, requireAdminAuth, getVariantsByMenuItemIdAdmin);
router.post("/", authMiddleware, requireAdminAuth, createMenuItemVariantAdmin);
router.patch("/:id", authMiddleware, requireAdminAuth, updateMenuItemVariantAdmin);
router.delete("/:id", authMiddleware, requireAdminAuth, deleteMenuItemVariantAdmin);
router.patch('/:id/toggle-dynamic-pricing', authMiddleware, requireAdminAuth, toggleMenuItemVariantDynamicPricingAdmin);

export default router; 