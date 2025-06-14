import { Router } from "express";
import {
  checkout,
  confirmMockCheckout,
} from "../controllers/ticketCheckout.controller";
import { authMiddleware } from "../middlewares/authMiddleware";
import { optionalAuthMiddleware } from "../middlewares/optionalAuthMiddleware";
import { initiateMockCheckout } from "../controllers/ticketInitiate.controller"; // rememeber to switch and delete everything related to mock checkout

const router = Router();

// 🛒 Legacy one-step checkout (no payment)
router.post("/", async (req, res) => {
  try {
    await checkout(req, res);
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 🧪 Step 1 – Initiate mock Wompi checkout (price calculation)
router.post("/initiate", optionalAuthMiddleware, async (req, res) => {
  try {
    await initiateMockCheckout(req, res);
  } catch (err) {
    console.error("Initiate error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ Step 2 – Confirm mock transaction & trigger ticketing flow
router.post("/confirm", async (req, res) => {
  try {
    await confirmMockCheckout(req, res);
  } catch (err) {
    console.error("Confirm error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
