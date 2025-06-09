import { Router } from "express";
import {
  createMenuCategory,
  getAllMenuCategories,
  updateMenuCategory,
  deleteMenuCategory,
} from "../controllers/menuCategory.controller";
import { requireClubOwnerAuth } from "../middlewares/authMiddleware";

const router = Router();

router.post("/menu/categories", requireClubOwnerAuth, createMenuCategory);
router.get("/menu/categories", getAllMenuCategories);
router.patch("/menu/categories/:id", requireClubOwnerAuth, updateMenuCategory);
router.delete("/menu/categories/:id", requireClubOwnerAuth, deleteMenuCategory);

export default router;
