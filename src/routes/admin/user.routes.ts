import { Router } from "express";
import {
  getAllUsers,
  getUserById,
  deleteUser,
  checkUserDeletionStatus,
  updateUserRole
} from "../../controllers/admin/user.controller";
import { authMiddleware, requireAdminAuth } from "../../middlewares/authMiddleware";

const router = Router();

// GET /admin/users - Get all users
router.get("/", authMiddleware, requireAdminAuth, getAllUsers);

// GET /admin/users/:id - Get specific user details
router.get("/:id", authMiddleware, requireAdminAuth, getUserById);

// DELETE /admin/users/:id - Delete user
router.delete("/:id", authMiddleware, requireAdminAuth, deleteUser);

// GET /admin/users/:id/deletion-status - Check if user can be deleted
router.get("/:id/deletion-status", authMiddleware, requireAdminAuth, checkUserDeletionStatus);

// PATCH /admin/users/:id/role - Update user role
router.patch("/:id/role", authMiddleware, requireAdminAuth, updateUserRole);

export default router; 