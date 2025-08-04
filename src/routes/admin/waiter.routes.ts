import { Router } from "express";
import { authMiddleware, requireAdminAuth } from "../../middlewares/authMiddleware";
import { createWaiterAdmin, deleteWaiterAdmin } from "../../controllers/admin/waiter.controller";

const router = Router();

// Admin routes for managing waiters for any club
router.post("/club/:clubId", authMiddleware, requireAdminAuth, createWaiterAdmin);
router.delete("/:id", authMiddleware, requireAdminAuth, deleteWaiterAdmin);

export default router; 