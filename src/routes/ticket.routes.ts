import { Router } from "express";
import { createTicket, getTicketsByClub, getAllTickets, getTicketById, updateTicket, deleteTicket, toggleTicketVisibility } from "../controllers/ticket.controller";
import { requireAdminAuth } from "../utils/auth.middleware";

const router = Router();

router.post("/", requireAdminAuth, createTicket); 
router.get("/club/:id", getTicketsByClub);
router.get("/", getAllTickets);
router.get("/:id", getTicketById);
router.put("/:id", requireAdminAuth, updateTicket); 
router.delete("/:id", requireAdminAuth, deleteTicket);
router.patch("/:id/hide", requireAdminAuth, toggleTicketVisibility);

export default router;