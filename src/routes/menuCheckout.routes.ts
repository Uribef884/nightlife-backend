import { Router } from "express";
import {
  menuCheckout,
  confirmMockMenuCheckout,
} from "../controllers/menuCheckout.controller";
import { attachUserIfExists } from "../middlewares/authMiddleware";

const router = Router();

router.post("/menu/checkout", attachUserIfExists, menuCheckout);
router.post("/menu/checkout/confirm", attachUserIfExists, confirmMockMenuCheckout);

export default router;
