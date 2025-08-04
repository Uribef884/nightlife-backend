import { Router } from "express";
import {
  getAllMenuCategoriesAdmin,
  createMenuCategoryAdmin,
  updateMenuCategoryAdmin,
  deleteMenuCategoryAdmin,
} from "../../controllers/admin/menuCategory.controller";
import { authMiddleware, requireAdminAuth } from "../../middlewares/authMiddleware";

const router = Router();

// Admin routes for managing menu categories for any club
router.get("/club/:clubId", authMiddleware, requireAdminAuth, getAllMenuCategoriesAdmin);
router.post("/club/:clubId", authMiddleware, requireAdminAuth, createMenuCategoryAdmin);
router.patch("/:id", authMiddleware, requireAdminAuth, updateMenuCategoryAdmin);
router.delete("/:id", authMiddleware, requireAdminAuth, deleteMenuCategoryAdmin);

export default router; 