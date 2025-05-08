import { Router } from "express";
import { getClubOrders, getClubOrderById } from "../controllers/order.controller";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.use(requireAuth);
// @ts-ignore
router.get("/", getClubOrders);
// @ts-ignore
router.get("/:id", getClubOrderById);

export default router;
