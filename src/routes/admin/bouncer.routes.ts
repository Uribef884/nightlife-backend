import { Router } from "express";
import { authMiddleware, requireAdminAuth } from "../../middlewares/authMiddleware";
import { createBouncerAdmin, deleteBouncerAdmin } from "../../controllers/admin/bouncer.controller";

const router = Router();

// Admin routes for managing bouncers for any club
router.post("/club/:clubId", authMiddleware, requireAdminAuth, createBouncerAdmin);
router.delete("/:id", authMiddleware, requireAdminAuth, deleteBouncerAdmin);

export default router; 