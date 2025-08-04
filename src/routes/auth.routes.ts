import { Router } from "express";
import {
  register,
  login,
  deleteOwnUser,
  logout,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  googleAuth,
  googleCallback,
  googleTokenAuth,
  checkUserDeletionStatus
} from "../controllers/auth.controller";
import { isAdmin } from "../middlewares/isAdmin";
import { requireAuth } from "../middlewares/requireAuth";
import { honeypotMiddleware } from "../middlewares/honeypotMiddleware";
import { validateAuthInput } from "../middlewares/validateAuthInput";
import { rateLimiter, loginLimiter } from "../middlewares/rateLimiter";

const router = Router();

// Public routes
router.post("/register", rateLimiter, honeypotMiddleware, validateAuthInput(), register);
router.post("/login", loginLimiter, honeypotMiddleware, validateAuthInput(), login);

// ✅ Forgot/reset password
router.post("/forgot-password", rateLimiter, honeypotMiddleware, forgotPassword);
router.post("/reset-password", resetPassword);

// ✅ Google OAuth routes
router.get("/google", googleAuth);
router.get("/google/callback", googleCallback);
router.post("/google/token", rateLimiter, googleTokenAuth);

// Authenticated user routes
router.post("/logout", requireAuth, logout);
router.delete("/me", requireAuth, deleteOwnUser);
router.get("/me", requireAuth, getCurrentUser); // New route to test something in mock frontend
router.get("/me/deletion-status", requireAuth, checkUserDeletionStatus);

export default router;
