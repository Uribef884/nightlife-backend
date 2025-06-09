import { Router } from "express";
import {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getAllMenuItemsByClub,
} from "../controllers/menuItem.controller";
import { requireClubOwnerAuth } from "../middlewares/authMiddleware";

const router = Router();

router.post("/menu/items", requireClubOwnerAuth, createMenuItem);
router.patch("/menu/items/:id", requireClubOwnerAuth, updateMenuItem);
router.delete("/menu/items/:id", requireClubOwnerAuth, deleteMenuItem);
router.get("/menu/items/:clubId", getAllMenuItemsByClub);

export default router;
