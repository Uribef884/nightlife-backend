import { Router } from "express";
import {
  createClub,
  getClubById,
  updateClub,
  deleteClub,
} from "../../controllers/club.controller";
import { authMiddleware, requireAdminAuth } from "../../middlewares/authMiddleware";

const router = Router();

// Admin routes for managing any club
router.post("/", authMiddleware, requireAdminAuth, createClub);
router.get("/:id", authMiddleware, requireAdminAuth, getClubById);
router.put("/:id", authMiddleware, requireAdminAuth, updateClub);
router.delete("/:id", authMiddleware, requireAdminAuth, deleteClub);

export default router; 