import { Router } from "express";
import {
  createTicket,
  getTicketsByClub,
  getAllTickets,
  getTicketById,
  updateTicket,
  deleteTicket,
  toggleTicketVisibility,
  getTicketsForMyClub,
  toggleTicketDynamicPricing
} from "../controllers/ticket.controller";
import { authMiddleware, requireClubOwnerOrAdmin } from "../middlewares/authMiddleware";
import { validateTicketInput } from "../utils/ticketValidators";
import { createLimiter } from "../middlewares/rateLimiter";

const router = Router();

// ✅ Public access
router.get("/", getAllTickets);
router.get("/my-club", authMiddleware, requireClubOwnerOrAdmin, getTicketsForMyClub);
router.get("/:id", getTicketById);
router.get("/club/:id", getTicketsByClub);

// ✅ Authenticated + Role-protected
router.post("/", createLimiter, authMiddleware, requireClubOwnerOrAdmin, validateTicketInput ,createTicket);
router.put("/:id", authMiddleware, requireClubOwnerOrAdmin, updateTicket);
router.delete("/:id", authMiddleware, requireClubOwnerOrAdmin, deleteTicket);
router.patch("/:id/hide", authMiddleware, requireClubOwnerOrAdmin, toggleTicketVisibility);
router.patch('/:id/toggle-dynamic-pricing', authMiddleware, requireClubOwnerOrAdmin, toggleTicketDynamicPricing);

export default router;