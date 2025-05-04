import { Router } from "express";
import { getClubOrders, getClubOrderById } from "../controllers/order.controller";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.use(requireAuth);

router.get("/", getClubOrders);
router.get("/:id", getClubOrderById);

export default router;
