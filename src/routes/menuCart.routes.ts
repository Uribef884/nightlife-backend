import { Router } from "express";
import {
  addToMenuCart,
  updateMenuCartItem,
  removeMenuCartItem,
  getUserMenuCart,
} from "../controllers/menuCart.controller";
import {  attachSessionId } from "../middlewares/authMiddleware";
const router = Router();

router.get("/cart", attachSessionId, getUserMenuCart);
router.post("/cart", attachSessionId, addToMenuCart);
router.patch("/cart", attachSessionId, updateMenuCartItem);
router.delete("/cart/:id", attachSessionId, removeMenuCartItem);

export default router;
