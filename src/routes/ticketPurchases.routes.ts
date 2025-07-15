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
  getPurchaseByIdAdmin,
  validateTicketQR
} from "../controllers/ticketPurchases.controller";

const router = Router();

// 🏢 Club owners
router.get("/club", authMiddleware, requireClubOwnerOrAdmin, getClubPurchases);
router.get("/club/:id", authMiddleware, requireClubOwnerOrAdmin, getClubPurchaseById);

// 🛡 Admins
router.get("/admin", authMiddleware, requireAdminAuth, getAllPurchasesAdmin);
router.get("/admin/:id", authMiddleware, requireAdminAuth, getPurchaseByIdAdmin);

// 🧑 Regular users
router.get("/", authMiddleware, getUserPurchases);
router.get("/:id", authMiddleware, getUserPurchaseById); // ❗️Always last

export default router;