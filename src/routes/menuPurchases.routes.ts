import { Router } from "express";
import {
  getAllMenuPurchasesAdmin,
  getUserMenuPurchases,
  getUserMenuPurchaseById,
  getClubMenuPurchases,
  getClubMenuPurchaseById,
  validateMenuQR,
} from "../controllers/menuPurchases.controller";
import {
  requireAuth,
  requireAdminAuth,
  requireClubOwnerOrAdmin,
  requireWaiterAuth,
} from "../middlewares/authMiddleware";

const router = Router();

// 👤 User
router.get("/menu/purchases", requireAuth, getUserMenuPurchases);
router.get("/menu/purchases/:id", requireAuth, getUserMenuPurchaseById);

// 🏢 Club
router.get("/menu/club/purchases", requireClubOwnerOrAdmin, getClubMenuPurchases);
router.get("/menu/club/purchases/:id", requireClubOwnerOrAdmin, getClubMenuPurchaseById);

// 🧾 Admin
router.get("/menu/admin/purchases", requireAdminAuth, getAllMenuPurchasesAdmin);

// ✅ QR Validation
router.post("/menu/purchases/validate/:id", requireWaiterAuth, validateMenuQR);

export default router;
