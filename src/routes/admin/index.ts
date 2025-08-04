import { Router } from "express";
import clubRoutes from "./club.routes";
import eventRoutes from "./event.routes";
import ticketRoutes from "./ticket.routes";
import menuItemRoutes from "./menuItem.routes";
import menuCategoryRoutes from "./menuCategory.routes";
import menuVariantRoutes from "./menuVariant.routes";
import ticketIncludedMenuRoutes from "./ticketIncludedMenu.routes";
import menuConfigRoutes from "./menuConfig.routes";
import bouncerRoutes from "./bouncer.routes";
import waiterRoutes from "./waiter.routes";
import adRoutes from "./ad.routes";
import ticketPurchaseRoutes from "./ticketPurchase.routes";
import menuPurchaseRoutes from "./menuPurchase.routes";
import fileUploadRoutes from "./fileUpload.routes";
import userRoutes from "./user.routes";

const router = Router();

// Admin routes - all require admin authentication
router.use("/clubs", clubRoutes);
router.use("/events", eventRoutes);
router.use("/tickets", ticketRoutes);
router.use("/menu/items", menuItemRoutes);
router.use("/menu/categories", menuCategoryRoutes);
router.use("/menu/variants", menuVariantRoutes);
router.use("/ticket-menu", ticketIncludedMenuRoutes);
router.use("/menu", menuConfigRoutes);
router.use("/bouncers", bouncerRoutes);
router.use("/waiters", waiterRoutes);
router.use("/ads", adRoutes);
router.use("/ticket-purchases", ticketPurchaseRoutes);
router.use("/menu-purchases", menuPurchaseRoutes);
router.use("/upload", fileUploadRoutes);
router.use("/users", userRoutes);

export default router; 