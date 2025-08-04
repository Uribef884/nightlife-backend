import { Router } from "express";
import { authMiddleware, requireAdminAuth } from "../../middlewares/authMiddleware";
import {
  getClubPurchases,
  getClubPurchaseById
} from "../../controllers/ticketPurchases.controller";

const router = Router();

// Admin routes for viewing ticket purchases with filtering
router.get("/club/:clubId", authMiddleware, requireAdminAuth, getClubPurchases);
router.get("/club/:clubId/:id", authMiddleware, requireAdminAuth, getClubPurchaseById);

export default router; 