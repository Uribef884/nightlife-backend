import { Router } from "express";
import {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getAllMenuItems,
  getMenuItemById,
  getItemsForMyClub,
  getMenuForClub
} from "../controllers/menuItem.controller";
import { authMiddleware, requireClubOwnerOrAdmin } from "../middlewares/authMiddleware";

const router = Router();

// Public routes
router.get("/all", getAllMenuItems);  //Returns all menu items across all clubs (only active items, with active variants).
router.get("/:id", getMenuItemById);
router.get("/club/:clubId", getMenuForClub);


// Clubowner routes
router.get("/my/items", authMiddleware, requireClubOwnerOrAdmin, getItemsForMyClub);
router.post("/", authMiddleware, requireClubOwnerOrAdmin, createMenuItem);
router.patch("/:id", authMiddleware, requireClubOwnerOrAdmin, updateMenuItem);
router.delete("/:id", authMiddleware, requireClubOwnerOrAdmin, deleteMenuItem);

export default router;