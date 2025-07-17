import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { requireWaiterOrClubOwner } from "../middlewares/requireWaiterOrClubOwner";
import { previewMenuQR, confirmMenuQR } from "../controllers/validateMenuQR.controller";

const router = Router();

console.log("🍽️ Setting up menu QR routes with waiter/clubowner middleware");

// Apply authentication middleware to all routes
router.use(requireAuth);

// Apply role-based middleware to all routes
router.use(requireWaiterOrClubOwner);

// Preview route - safe to read without invalidating
router.post("/", previewMenuQR);

// Confirm route - marks QR as used
router.post("/confirm", confirmMenuQR);

export default router; 