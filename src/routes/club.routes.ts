import { Router } from "express";
import {
  createClub,
  getAllClubs,
  getClubById,
  updateClub,
  deleteClub,
  getFilteredClubs, // ✅ Added
} from "../controllers/club.controller";
import { authMiddleware, requireAdminAuth } from "../middlewares/authMiddleware";

const router = Router();

router.get("/", getAllClubs);               // Public
router.get("/filter", getFilteredClubs);    // ✅ New Filtered Route
router.get("/:id", getClubById);            // Public

router.post("/", authMiddleware, requireAdminAuth, createClub); // Protected
router.put("/:id", authMiddleware, updateClub);                 // Protected
router.delete("/:id", authMiddleware, deleteClub);              // Protected

export default router;
