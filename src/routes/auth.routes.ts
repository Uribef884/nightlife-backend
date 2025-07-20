import { Router } from "express";
import {
  register,
  login,
  deleteUser,
  deleteOwnUser,
  updateUserRole,
  logout,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  googleAuth,
  googleCallback,
  googleTokenAuth
} from "../controllers/auth.controller";
import { isAdmin } from "../middlewares/isAdmin";
import { requireAuth } from "../middlewares/requireAuth";
import { honeypotMiddleware } from "../middlewares/honeypotMiddleware";
import { validateAuthInput } from "../middlewares/validateAuthInput";
import { rateLimiter } from "../middlewares/rateLimiter";

const router = Router();

// Public routes
router.post("/register", rateLimiter, honeypotMiddleware, validateAuthInput(), register);
router.post("/login", rateLimiter, honeypotMiddleware, validateAuthInput(), login);

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

// Admin-only routes
router.delete("/:id", requireAuth, isAdmin, deleteUser);
router.patch("/:id/role", requireAuth, isAdmin, updateUserRole);

export default router;
