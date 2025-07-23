import { Router } from "express";
import {
  createClub,
  getAllClubs,
  getClubById,
  updateClub,
  updateMyClub,
  deleteClub,
  getFilteredClubs, // ✅ Added
} from "../controllers/club.controller";
import { authMiddleware, requireAdminAuth, requireClubOwnerAuth } from "../middlewares/authMiddleware";

const router = Router();

router.get("/", getAllClubs);               // Public
router.get("/filter", getFilteredClubs);    // ✅ New Filtered Route
router.get("/:id", getClubById);            // Public

router.post("/", authMiddleware, requireAdminAuth, createClub); // Protected
router.put("/my-club", authMiddleware, requireClubOwnerAuth, updateMyClub); // Club owner only - MUST come before /:id
router.put("/:id", authMiddleware, requireAdminAuth, updateClub); // Admin only
router.delete("/:id", authMiddleware, deleteClub);              // Protected

export default router;
