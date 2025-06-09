import { Router } from "express";
import {
  addToCart,
  updateCartItem,
  removeCartItem,
  getUserCart,
} from "../controllers/ticketCart.controller";

const router = Router();

// Anonymous and authenticated users can use the cart
router.post("/add", addToCart);
router.patch("/update", updateCartItem);
router.delete("/item/:id", removeCartItem);
router.get("/", getUserCart);

export default router;
