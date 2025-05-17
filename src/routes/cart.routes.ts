import { Router } from "express";
import {
  addToCart,
  updateCartItem,
  removeCartItem,
  getUserCart,
} from "../controllers/cart.controller";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// Anonymous and authenticated users can use the cart
router.post("/add", authMiddleware, addToCart);
router.patch("/update", authMiddleware, updateCartItem);
router.delete("/item/:id", authMiddleware, removeCartItem);
router.get("/", authMiddleware, getUserCart);

export default router;
