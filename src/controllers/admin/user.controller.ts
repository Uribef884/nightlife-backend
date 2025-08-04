import { Request, Response } from "express";
import { AppDataSource } from "../../config/data-source";
import { User } from "../../entities/User";
import { AuthenticatedRequest } from "../../types/express";
import { sanitizeInput, sanitizeObject } from "../../utils/sanitizeInput";
import { anonymizeUser, canUserBeDeleted } from "../../utils/anonymizeUser";

/**
 * GET /admin/users - Get all users (admin only)
 */
export async function getAllUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userRepo = AppDataSource.getRepository(User);
    const users = await userRepo.find({
      select: [
        "id", "email", "originalEmail", "role", "firstName", "lastName", 
        "isDeleted", "deletedAt", "createdAt", "updatedAt", "clubId"
      ],
      order: { createdAt: "DESC" }
    });

    res.json({
      users: users.map(user => ({
        id: user.id,
        email: user.isDeleted ? user.originalEmail : user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        isDeleted: user.isDeleted,
        deletedAt: user.deletedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        clubId: user.clubId
      }))
    });
  } catch (error) {
    console.error("❌ Error getting all users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /admin/users/:id - Get specific user details (admin only)
 */
export async function getUserById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // Sanitize the user ID
    const sanitizedId = sanitizeInput(id);
    if (!sanitizedId) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: sanitizedId });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      email: user.isDeleted ? user.originalEmail : user.email,
      originalEmail: user.originalEmail,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isDeleted: user.isDeleted,
      deletedAt: user.deletedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      clubId: user.clubId,
      isOAuthUser: user.isOAuthUser
    });
  } catch (error) {
    console.error("❌ Error getting user by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /admin/users/:id - Delete user (admin only)
 */
export async function deleteUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Sanitize the user ID
    const sanitizedId = sanitizeInput(id);
    if (!sanitizedId) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: sanitizedId });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.isDeleted) {
      res.status(400).json({ error: "User account is already deleted" });
      return;
    }

    // Check if user can be deleted
    const canDelete = await canUserBeDeleted(sanitizedId);
    if (!canDelete.success) {
      if (canDelete.requiresTransfer) {
        res.status(400).json({ 
          error: canDelete.message,
          requiresTransfer: true,
          clubsToTransfer: canDelete.clubsToTransfer?.map(club => ({
            id: club.id,
            name: club.name
          }))
        });
      } else {
        res.status(400).json({ error: canDelete.message });
      }
      return;
    }

    // Anonymize the user instead of hard deleting
    const result = await anonymizeUser(sanitizedId);
    
    if (result.success) {
      res.status(200).json({ 
        message: "User account anonymized successfully",
        userId: sanitizedId
      });
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /admin/users/:id/deletion-status - Check if user can be deleted (admin only)
 */
export async function checkUserDeletionStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Sanitize the user ID
    const sanitizedId = sanitizeInput(id);
    if (!sanitizedId) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: sanitizedId });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const result = await canUserBeDeleted(sanitizedId);
    
    if (result.success) {
      res.json({ 
        canDelete: true, 
        message: result.message 
      });
    } else {
      res.json({ 
        canDelete: false, 
        message: result.message,
        requiresTransfer: result.requiresTransfer,
        clubsToTransfer: result.clubsToTransfer?.map(club => ({
          id: club.id,
          name: club.name
        }))
      });
    }
  } catch (error) {
    console.error("❌ Error checking user deletion status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PATCH /admin/users/:id/role - Update user role (admin only)
 */
export async function updateUserRole(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // Sanitize the user ID
    const sanitizedId = sanitizeInput(id);
    if (!sanitizedId) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    // Sanitize the request body
    const sanitizedBody = sanitizeObject(req.body, ['role'], { maxLength: 20 });
    const { role } = sanitizedBody;

    if (!role || !["clubowner", "bouncer", "user"].includes(role)) {
      res.status(400).json({ error: "Invalid role. Allowed roles: user, clubowner, bouncer." });
      return;
    }

    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOneBy({ id: sanitizedId });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.role === "admin") {
      res.status(403).json({ error: "Cannot change role of an admin via API" });
      return;
    }

    if (user.isDeleted) {
      res.status(400).json({ error: "Cannot modify deleted user" });
      return;
    }

    user.role = role;
    await repo.save(user);

    res.json({ 
      message: `User role updated to ${role}`,
      userId: sanitizedId,
      newRole: role
    });
  } catch (error) {
    console.error("❌ Error updating user role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} 