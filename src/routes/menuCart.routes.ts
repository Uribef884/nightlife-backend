import { Router } from "express";
import {
  addToMenuCart,
  updateMenuCartItem,
  removeMenuCartItem,
  getUserMenuCart,
} from "../controllers/menuCart.controller";

const router = Router();

// Anonymous and authenticated users can use the menu cart
router.post("/add", addToMenuCart);
router.patch("/update", updateMenuCartItem);
router.delete("/item/:id", removeMenuCartItem);
router.get("/", getUserMenuCart);

export default router;