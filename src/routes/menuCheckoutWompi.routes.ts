import { Router } from "express";
import { 
  confirmWompiMenuCheckout, 
  checkWompiMenuTransactionStatus 
} from "../controllers/menuCheckoutWompi.controller";
import { optionalAuthMiddleware } from "../middlewares/optionalAuthMiddleware";

const router = Router();

// ✅ Step 2 – Confirm Wompi transaction & trigger menu flow
router.post("/confirm", optionalAuthMiddleware, async (req, res) => {
  try {
    await confirmWompiMenuCheckout(req, res);
  } catch (err) {
    console.error("Wompi menu confirm error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 📊 Check Wompi menu transaction status
router.get("/status/:transactionId", optionalAuthMiddleware, async (req, res) => {
  try {
    await checkWompiMenuTransactionStatus(req, res);
  } catch (err) {
    console.error("Wompi menu status error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router; 