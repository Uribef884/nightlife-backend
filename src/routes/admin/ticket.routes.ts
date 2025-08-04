import { Router } from "express";
import {
  createTicketAdmin,
  getTicketsByClubAdmin,
  getTicketByIdAdmin,
  updateTicketAdmin,
  deleteTicketAdmin,
  toggleTicketVisibilityAdmin,
  toggleTicketDynamicPricingAdmin
} from "../../controllers/admin/ticket.controller";
import { authMiddleware, requireAdminAuth } from "../../middlewares/authMiddleware";
import { validateTicketInput } from "../../utils/ticketValidators";
import { createLimiter } from "../../middlewares/rateLimiter";

const router = Router();

// Admin routes for managing tickets for any club
router.get("/club/:clubId", authMiddleware, requireAdminAuth, getTicketsByClubAdmin);
router.get("/:id", authMiddleware, requireAdminAuth, getTicketByIdAdmin);
router.post("/club/:clubId", createLimiter, authMiddleware, requireAdminAuth, validateTicketInput, createTicketAdmin);
router.put("/:id", authMiddleware, requireAdminAuth, updateTicketAdmin);
router.delete("/:id", authMiddleware, requireAdminAuth, deleteTicketAdmin);
router.patch("/:id/hide", authMiddleware, requireAdminAuth, toggleTicketVisibilityAdmin);
router.patch('/:id/toggle-dynamic-pricing', authMiddleware, requireAdminAuth, toggleTicketDynamicPricingAdmin);

export default router; 