import { Router } from "express";
import {
  createTicket,
  getTicketsByClub,
  getAllTickets,
  getTicketById,
  updateTicket,
  deleteTicket,
  toggleTicketVisibility
} from "../controllers/ticket.controller";
import { authMiddleware, requireClubOwnerOrAdmin } from "../middlewares/authMiddleware";

const router = Router();

// ✅ Public access
router.get("/", getAllTickets);
router.get("/:id", getTicketById);
router.get("/club/:id", getTicketsByClub);

// ✅ Authenticated + Role-protected
router.post("/", authMiddleware, requireClubOwnerOrAdmin, createTicket);
router.put("/:id", authMiddleware, requireClubOwnerOrAdmin, updateTicket);
router.delete("/:id", authMiddleware, requireClubOwnerOrAdmin, deleteTicket);
router.patch("/:id/hide", authMiddleware, requireClubOwnerOrAdmin, toggleTicketVisibility);

export default router;