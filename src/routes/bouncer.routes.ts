import { Router } from "express";
import { authMiddleware, requireClubOwnerOrAdmin } from "../middlewares/authMiddleware";
import { createBouncer, getBouncers, deleteBouncer } from "../controllers/bouncer.controller";

const router = Router();

router.post("/", authMiddleware, requireClubOwnerOrAdmin, createBouncer);
router.get("/", authMiddleware, requireClubOwnerOrAdmin, getBouncers);
router.delete("/:id", authMiddleware, requireClubOwnerOrAdmin, deleteBouncer);

export default router;
