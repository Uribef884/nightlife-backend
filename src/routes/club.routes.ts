import { Router } from "express";
import { createClub, getAllClubs, updateClub, deleteClub, getClubById } from "../controllers/club.controller";
import { requireAdminAuth } from "../utils/auth.middleware";

const router = Router();

router.get("/", getAllClubs);  
router.get("/:id", getClubById);

router.post("/", requireAdminAuth, createClub);
router.put("/:id", requireAdminAuth, updateClub);
router.delete("/:id", requireAdminAuth, deleteClub);
export default router;
