import { Router } from "express";
import {
  authMiddleware,
  requireAdminAuth,
  requireClubOwnerOrAdmin,
} from "../middlewares/authMiddleware";
import {
  getUserPurchases,
  getUserPurchaseById,
  getClubPurchases,
  getClubPurchaseById,
  getAllPurchasesAdmin,
  getPurchaseByIdAdmin
} from "../controllers/purchases.controller";

const router = Router();

// 🏢 Club owners only — must go before :id
router.get("/club", authMiddleware, requireClubOwnerOrAdmin, getClubPurchases);
router.get("/club/:id", authMiddleware, requireClubOwnerOrAdmin, getClubPurchaseById);

// 🛡 Admins only — must go before :id
router.get("/admin", authMiddleware, requireAdminAuth, getAllPurchasesAdmin);
router.get("/admin/:id", authMiddleware, requireAdminAuth, getPurchaseByIdAdmin);

// 🧑 Regular users (must be authenticated)
router.get("/", authMiddleware, getUserPurchases);
router.get("/:id", authMiddleware, getUserPurchaseById); // last: matches UUIDs only

export default router;
