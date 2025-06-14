import { Router } from "express";
import {
  getUserMenuPurchases,
  getUserMenuPurchaseById,
  getClubMenuPurchases,
  getClubMenuPurchaseById,
  getAllMenuPurchasesAdmin,
  getMenuPurchaseByIdAdmin,
} from "../controllers/menuPurchases.controller";
import { authMiddleware, requireAdminAuth, requireClubOwnerOrAdmin } from "../middlewares/authMiddleware";

const router = Router();

// 👤 Normal users (must be logged in)
router.get("/my", authMiddleware, getUserMenuPurchases);
router.get("/my/:id", authMiddleware, getUserMenuPurchaseById);

// 🏢 Club owners (view purchases of their club)
router.get("/club", authMiddleware, requireClubOwnerOrAdmin, getClubMenuPurchases);
router.get("/club/:id", authMiddleware, requireClubOwnerOrAdmin, getClubMenuPurchaseById);

// 🛡 Admins only
router.get("/admin", authMiddleware, requireAdminAuth, getAllMenuPurchasesAdmin);
router.get("/admin/:id", authMiddleware, requireAdminAuth, getMenuPurchaseByIdAdmin);

export default router;