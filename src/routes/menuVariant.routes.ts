import { Router } from "express";
import {
  getVariantsByMenuItemId,
  createMenuItemVariant,
  updateMenuItemVariant,
  deleteMenuItemVariant,
} from "../controllers/menuVariant.controller";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// 📖 Public – Get all variants for a given menu item
router.get("/:menuItemId", getVariantsByMenuItemId);

// 🛠 Clubowner-only – CRUD for variants
router.post("/", authMiddleware, createMenuItemVariant);
router.patch("/:id", authMiddleware, updateMenuItemVariant);
router.delete("/:id", authMiddleware, deleteMenuItemVariant);

export default router;
