// src/routes/menuCategory.routes.ts
import { Router } from "express";
import {
  getAllMenuCategories,
  createMenuCategory,
  updateMenuCategory,
  deleteMenuCategory,
} from "../controllers/menuCategory.controller";
import { authMiddleware, requireClubOwnerOrAdmin } from "../middlewares/authMiddleware";

const router = Router();

// Public route to view categories by club
router.get("/:clubId", getAllMenuCategories);

// Protected routes for clubowners/admins
router.post("/", authMiddleware, requireClubOwnerOrAdmin, createMenuCategory);
router.patch("/:id", authMiddleware, requireClubOwnerOrAdmin, updateMenuCategory);
router.delete("/:id", authMiddleware, requireClubOwnerOrAdmin, deleteMenuCategory);

export default router;
