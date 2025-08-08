import { Router } from "express";
import { 
  confirmWompiTicketCheckout, 
  checkWompiTransactionStatus 
} from "../controllers/ticketCheckoutWompi.controller";
import { optionalAuthMiddleware } from "../middlewares/optionalAuthMiddleware";

const router = Router();

// ✅ Step 2 – Confirm Wompi transaction & trigger ticketing flow
router.post("/confirm", optionalAuthMiddleware, async (req, res) => {
  try {
    await confirmWompiTicketCheckout(req, res);
  } catch (err) {
    console.error("Wompi ticket confirm error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 📊 Check Wompi transaction status
router.get("/status/:transactionId", optionalAuthMiddleware, async (req, res) => {
  try {
    await checkWompiTransactionStatus(req, res);
  } catch (err) {
    console.error("Wompi ticket status error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router; 