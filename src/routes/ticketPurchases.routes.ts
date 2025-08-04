import { Router } from "express";
import {
  authMiddleware,
  requireClubOwnerAuth,
} from "../middlewares/authMiddleware";
import {
  getUserPurchases,
  getUserPurchaseById,
  getClubPurchases,
  getClubPurchaseById,
  validateTicketQR
} from "../controllers/ticketPurchases.controller";

const router = Router();

// 🏢 Club owners
router.get("/club", authMiddleware, requireClubOwnerAuth, getClubPurchases);
router.get("/club/:id", authMiddleware, requireClubOwnerAuth, getClubPurchaseById);

// 🧑 Regular users
router.get("/", authMiddleware, getUserPurchases);
router.get("/:id", authMiddleware, getUserPurchaseById); // ❗️Always last

export default router;