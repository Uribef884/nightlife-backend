import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { requireBouncerOrClubOwner } from "../middlewares/requireBouncerOrClubOwner";
import { previewTicketQR, confirmTicketQR } from "../controllers/validateTicketQR.controller";

const router = Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Apply role-based middleware to all routes
router.use(requireBouncerOrClubOwner);

// Preview route - safe to read without invalidating
router.post("/", previewTicketQR);

// Confirm route - marks QR as used
router.post("/confirm", confirmTicketQR);

export default router; 