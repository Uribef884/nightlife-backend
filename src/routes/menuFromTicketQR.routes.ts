import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { requireWaiterOrClubOwner } from "../middlewares/requireWaiterOrClubOwner";
import { previewMenuFromTicketQR, confirmMenuFromTicketQR } from "../controllers/validateMenuFromTicketQR.controller";

const router = Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Apply role-based middleware to all routes (only waiters can validate menu QRs)
router.use(requireWaiterOrClubOwner);

// Preview route - safe to read without invalidating
router.post("/", previewMenuFromTicketQR);

// Confirm route - marks QR as used
router.post("/confirm", confirmMenuFromTicketQR);

export default router; 