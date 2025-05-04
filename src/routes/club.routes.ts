import { Router } from "express";
import { createClub, getAllClubs, updateClub, deleteClub, getClubById } from "../controllers/club.controller";
import { requireClubOwnerOrAdmin } from "../utils/auth.middleware";


const router = Router();

router.get("/", getAllClubs);  
router.get("/:id", getClubById);

router.post("/", requireClubOwnerOrAdmin, createClub);
router.put("/:id", requireClubOwnerOrAdmin, updateClub);
router.delete("/:id", requireClubOwnerOrAdmin, deleteClub);


export default router;
