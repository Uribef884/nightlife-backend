import { Router } from "express";
import { authMiddleware, requireAdminAuth } from "../../middlewares/authMiddleware";
import {
  getClubMenuPurchases,
  getClubMenuPurchaseById,
} from "../../controllers/menuPurchases.controller";

const router = Router();

// Admin routes for viewing menu purchases with filtering
router.get("/club/:clubId", authMiddleware, requireAdminAuth, getClubMenuPurchases);
router.get("/club/:clubId/:id", authMiddleware, requireAdminAuth, getClubMenuPurchaseById);

export default router; 