import { Router } from "express";
import { initiateWompiMenuCheckout } from "../controllers/menuInitiateWompi.controller";
import { optionalAuthMiddleware } from "../middlewares/optionalAuthMiddleware";

const router = Router();

// 🍽️ Step 1 – Initiate Wompi menu checkout
router.post("/", optionalAuthMiddleware, async (req, res) => {
  try {
    await initiateWompiMenuCheckout(req, res);
  } catch (err) {
    console.error("Wompi menu initiate error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router; 