import { Router } from "express";
import {
  addToCart,
  updateCartItem,
  removeCartItem,
  getCartItems,
  getCartSummary,
  clearCart,
  clearMenuCartFromTicket
} from "../controllers/ticketCart.controller";

const router = Router();

// Anonymous and authenticated users can use the cart
router.post("/add", addToCart);
router.patch("/update", updateCartItem);
router.delete("/item/:id", removeCartItem);
router.get("/", getCartItems); // Returns cart items array
router.get("/summary", getCartSummary); // Returns cart summary with totals
router.delete("/clear", clearCart); 
router.delete("/clear-other-cart", clearMenuCartFromTicket); //Used if user want to add menuitem to existing ticket cart

export default router;
