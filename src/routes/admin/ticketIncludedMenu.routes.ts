import { Router } from "express";
import { requireAuth } from "../../middlewares/requireAuth";
import { requireAdminAuth } from "../../middlewares/authMiddleware";
import { 
  getTicketIncludedMenuItemsAdmin, 
  addTicketIncludedMenuItemAdmin, 
  removeTicketIncludedMenuItemAdmin, 
  updateTicketIncludedMenuItemAdmin 
} from "../../controllers/admin/ticketIncludedMenu.controller";

const router = Router();

// Apply authentication middleware to all routes
router.use(requireAuth);
router.use(requireAdminAuth);

// Admin routes for managing ticket included menu items
router.get("/:ticketId", getTicketIncludedMenuItemsAdmin);
router.post("/:ticketId", addTicketIncludedMenuItemAdmin);
router.delete("/:ticketId/:itemId", removeTicketIncludedMenuItemAdmin);
router.put("/:ticketId/:itemId", updateTicketIncludedMenuItemAdmin);

export default router; 