import { Router } from "express";
import { authMiddleware, requireAdminAuth } from "../../middlewares/authMiddleware";
import { 
  getMenuConfig, 
  switchMenuType
} from "../../controllers/menuConfig.controller";

const router = Router();

// Admin routes for managing menu configuration for any club
router.get("/club/:clubId/config", authMiddleware, requireAdminAuth, getMenuConfig);
router.put("/club/:clubId/type", authMiddleware, requireAdminAuth, switchMenuType);

export default router; 