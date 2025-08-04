import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { Club } from "../entities/Club";
import { v4 as uuidv4 } from "uuid";

export interface AnonymizationResult {
  success: boolean;
  message: string;
  requiresTransfer?: boolean;
  clubsToTransfer?: Club[];
}

/**
 * Anonymizes a user account while preserving all business-critical data
 * This approach maintains data integrity while effectively "deleting" personal information
 */
export async function anonymizeUser(userId: string): Promise<AnonymizationResult> {
  const userRepo = AppDataSource.getRepository(User);
  const clubRepo = AppDataSource.getRepository(Club);

  try {
    const user = await userRepo.findOne({
      where: { id: userId },
      relations: ["club"]
    });

    if (!user) {
      return {
        success: false,
        message: "User not found"
      };
    }

    // Check if user owns clubs
    if (user.role === "clubowner") {
      const ownedClubs = await clubRepo.find({
        where: { ownerId: userId, isDeleted: false }
      });

      if (ownedClubs.length > 0) {
        return {
          success: false,
          message: "Cannot delete account while owning clubs. Please transfer ownership first.",
          requiresTransfer: true,
          clubsToTransfer: ownedClubs
        };
      }
    }

    // Store original email for audit purposes
    const originalEmail = user.email;
    
    // Generate anonymized email
    const anonymizedEmail = `deleted_user_${uuidv4()}@deleted.com`;
    
    // Anonymize user data
    user.originalEmail = originalEmail;
    user.email = anonymizedEmail;
    user.firstName = undefined;
    user.lastName = undefined;
    user.avatar = undefined;
    user.googleId = undefined;
    user.password = undefined; // Clear password
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.isOAuthUser = false;

    // Keep the role and clubId for business continuity
    // Keep the id for maintaining relationships

    await userRepo.save(user);

    return {
      success: true,
      message: "User account anonymized successfully"
    };

  } catch (error) {
    console.error("❌ Error anonymizing user:", error);
    return {
      success: false,
      message: "Internal server error during anonymization"
    };
  }
}

/**
 * Checks if a user can be deleted (anonymized)
 */
export async function canUserBeDeleted(userId: string): Promise<AnonymizationResult> {
  const userRepo = AppDataSource.getRepository(User);
  const clubRepo = AppDataSource.getRepository(Club);

  try {
    const user = await userRepo.findOneBy({ id: userId });

    if (!user) {
      return {
        success: false,
        message: "User not found"
      };
    }

    if (user.isDeleted) {
      return {
        success: false,
        message: "User account is already deleted"
      };
    }

    // Check if user owns clubs
    if (user.role === "clubowner") {
      const ownedClubs = await clubRepo.find({
        where: { ownerId: userId, isDeleted: false }
      });

      if (ownedClubs.length > 0) {
        return {
          success: false,
          message: "Cannot delete account while owning clubs. Please transfer ownership first.",
          requiresTransfer: true,
          clubsToTransfer: ownedClubs
        };
      }
    }

    return {
      success: true,
      message: "User can be deleted"
    };

  } catch (error) {
    console.error("❌ Error checking if user can be deleted:", error);
    return {
      success: false,
      message: "Internal server error"
    };
  }
} 