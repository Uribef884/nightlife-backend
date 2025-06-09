import { Router } from "express";
import {
  createMenuVariant,
  updateMenuVariant,
  getVariantsForMenuItem,
} from "../controllers/menuVariant.controller";
import { requireClubOwnerAuth } from "../middlewares/authMiddleware";

const router = Router();

router.post("/menu/variants", requireClubOwnerAuth, createMenuVariant);
router.patch("/menu/variants/:id", requireClubOwnerAuth, updateMenuVariant);
router.get("/menu/variants/:menuItemId", getVariantsForMenuItem);

export default router;
