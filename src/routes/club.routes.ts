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
import { searchLimiter } from "../middlewares/rateLimiter";

const router = Router();

router.get("/", getAllClubs);               // Public - basic navigation, no rate limiting needed
router.get("/filter", searchLimiter, getFilteredClubs);    // ✅ Search functionality with rate limiting
router.get("/:id", getClubById);            // Public

router.post("/", authMiddleware, requireAdminAuth, createClub); // Protected
router.put("/my-club", authMiddleware, requireClubOwnerAuth, updateMyClub); // Club owner only - MUST come before /:id
router.delete("/:id", authMiddleware, deleteClub);              // Protected

export default router;
