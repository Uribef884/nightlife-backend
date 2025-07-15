import { Router } from "express";
import { authMiddleware, requireClubOwnerOrAdmin } from "../middlewares/authMiddleware";
import { createWaiter, getWaiters, deleteWaiter } from "../controllers/waiter.controller";

const router = Router();

router.post("/", authMiddleware, requireClubOwnerOrAdmin, createWaiter);
router.get("/", authMiddleware, requireClubOwnerOrAdmin, getWaiters);
router.delete("/:id", authMiddleware, requireClubOwnerOrAdmin, deleteWaiter);

export default router; 