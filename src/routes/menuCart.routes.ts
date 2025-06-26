import { Router } from "express";
import {
  addToMenuCart,
  updateMenuCartItem,
  removeMenuCartItem,
  getUserMenuCart,
  clearMenuCart,
  clearTicketCartFromMenu
} from "../controllers/menuCart.controller";

const router = Router();

// Anonymous and authenticated users can use the menu cart
router.post("/add", addToMenuCart);
router.patch("/update", updateMenuCartItem);
router.delete("/item/:id", removeMenuCartItem);
router.get("/", getUserMenuCart);
router.delete("/clear", clearMenuCart);  
router.delete("/clear-other-cart", clearTicketCartFromMenu); //Used if user want to add tickets to existing menu cart
export default router;