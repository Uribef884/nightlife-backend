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

// 🏢 Club owners (view purchases of their club)
router.get("/club", authMiddleware, requireClubOwnerOrAdmin, getClubMenuPurchases);
router.get("/club/:id", authMiddleware, requireClubOwnerOrAdmin, getClubMenuPurchaseById);

// 🛡 Admins only
router.get("/admin", authMiddleware, requireAdminAuth, getAllMenuPurchasesAdmin);
router.get("/admin/:id", authMiddleware, requireAdminAuth, getMenuPurchaseByIdAdmin);

// 👤 Normal users (must be logged in)
router.get("/", authMiddleware, getUserMenuPurchases);
router.get("/:id", authMiddleware, getUserMenuPurchaseById);

export default router;