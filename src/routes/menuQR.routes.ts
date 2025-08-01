import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { requireWaiterOrClubOwner } from "../middlewares/requireWaiterOrClubOwner";
import { previewUnifiedMenuQR, confirmUnifiedMenuQR } from "../controllers/unifiedMenuQR.controller";
import { qrValidationLimiter } from "../middlewares/rateLimiter";

const router = Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Apply role-based middleware to all routes
router.use(requireWaiterOrClubOwner);

// Apply QR validation rate limiting to all routes
router.use(qrValidationLimiter);

// Preview route - safe to read without invalidating
router.post("/", previewUnifiedMenuQR);

// Confirm route - marks QR as used
router.post("/confirm", confirmUnifiedMenuQR);

export default router; 