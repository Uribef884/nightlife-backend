import { Router } from "express";
import { checkout } from "../controllers/checkout.controller";

const router = Router();

// ✅ Wrap the async controller to match Express' expectations
router.post("/", async (req, res) => {
  try {
    await checkout(req, res);
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
