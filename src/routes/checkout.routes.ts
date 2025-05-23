import { Router } from "express";
import { checkout } from "../controllers/checkout.controller";

const router = Router();

router.post("/", checkout); // works for both authenticated & anonymous

export default router;
