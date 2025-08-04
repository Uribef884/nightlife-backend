import { Router } from "express";
import {
  getAllUsers,
  getUserById,
  deleteUser,
  checkUserDeletionStatus,
  updateUserRole
} from "../../controllers/admin/user.controller";
import { requireAuth } from "../../middlewares/requireAuth";
import { isAdmin } from "../../middlewares/isAdmin";

const router = Router();

// All routes require admin authentication
router.use(requireAuth, isAdmin);

// GET /admin/users - Get all users
router.get("/", getAllUsers);

// GET /admin/users/:id - Get specific user details
router.get("/:id", getUserById);

// DELETE /admin/users/:id - Delete user
router.delete("/:id", deleteUser);

// GET /admin/users/:id/deletion-status - Check if user can be deleted
router.get("/:id/deletion-status", checkUserDeletionStatus);

// PATCH /admin/users/:id/role - Update user role
router.patch("/:id/role", updateUserRole);

export default router; 