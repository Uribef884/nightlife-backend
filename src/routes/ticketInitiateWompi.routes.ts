import { Router } from "express";
import { initiateWompiTicketCheckout } from "../controllers/ticketInitiateWompi.controller";
import { optionalAuthMiddleware } from "../middlewares/optionalAuthMiddleware";

const router = Router();

// 🎫 Step 1 – Initiate Wompi ticket checkout
router.post("/", optionalAuthMiddleware, async (req, res) => {
  try {
    await initiateWompiTicketCheckout(req, res);
  } catch (err) {
    console.error("Wompi ticket initiate error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router; 