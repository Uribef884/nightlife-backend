import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { requireClubOwnerAuth  } from "../middlewares/authMiddleware";
import { 
  getTicketIncludedMenuItems, 
  addTicketIncludedMenuItem, 
  removeTicketIncludedMenuItem, 
  updateTicketIncludedMenuItem 
} from "../controllers/ticketIncludedMenu.controller";

const router = Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

router.use(requireClubOwnerAuth);

// Get all included menu items for a ticket
router.get("/:ticketId", getTicketIncludedMenuItems);

// Add a menu item to a ticket
router.post("/:ticketId", addTicketIncludedMenuItem);

// Remove a menu item from a ticket
router.delete("/:ticketId/:itemId", removeTicketIncludedMenuItem);

// Update quantity of a menu item in a ticket
router.put("/:ticketId/:itemId", updateTicketIncludedMenuItem);

export default router; 