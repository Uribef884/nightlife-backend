import { Router } from "express";
import {
  getUserMenuPurchases,
  getUserMenuPurchaseById,
  getClubMenuPurchases,
  getClubMenuPurchaseById,
} from "../controllers/menuPurchases.controller";
import { authMiddleware, requireClubOwnerAuth } from "../middlewares/authMiddleware";

const router = Router();

// 🏢 Club owners (view purchases of their club)
router.get("/club", authMiddleware, requireClubOwnerAuth, getClubMenuPurchases);
router.get("/club/:id", authMiddleware, requireClubOwnerAuth, getClubMenuPurchaseById);

// 👤 Normal users (must be logged in)
router.get("/", authMiddleware, getUserMenuPurchases);
router.get("/:id", authMiddleware, getUserMenuPurchaseById);

export default router;