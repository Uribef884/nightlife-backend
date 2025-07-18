import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { 
  getMenuConfig, 
  switchMenuType
} from "../controllers/menuConfig.controller";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get current menu configuration
router.get("/config", getMenuConfig);

// Switch menu type (structured ↔ pdf)
router.put("/type", switchMenuType);

// PDF menu management now handled by /upload/menu/pdf

export default router; 