import { Router } from "express";
import { processSuccessfulMenuCheckout } from "../controllers/menuCheckout.controller";
import { initiateMenuCheckout } from "../controllers/menuInitiate.controller";
import { optionalAuthMiddleware } from "../middlewares/optionalAuthMiddleware";
import { confirmMockMenuCheckout } from "../controllers/menuCheckout.controller";

const router = Router();

// Legacy one-step menu checkout
router.post("/", async (req, res) => {
  try {
    await processSuccessfulMenuCheckout({
      userId: req.user?.id ?? null,
      sessionId: req.cookies?.sessionId ?? null,
      email: req.body.email,
      req,
      res,
    });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Step 1 – Initiate
router.post("/initiate", optionalAuthMiddleware, async (req, res) => {
  try {
    await initiateMenuCheckout(req, res);
  } catch (err) {
    console.error("Initiate error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Step 2 – Confirm (calls same handler as legacy, but with transactionId)
// ✅ Step 2 – Confirm transaction & trigger menu flow
router.post("/confirm", async (req, res) => {
  try {
    await confirmMockMenuCheckout(req, res);
  } catch (err) {
    console.error("Confirm error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
