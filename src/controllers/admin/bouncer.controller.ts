import { Request, Response } from "express";
import { AppDataSource } from "../../config/data-source";
import { User } from "../../entities/User";
import { AuthenticatedRequest } from "../../types/express";
import { sanitizeInput, sanitizeObject } from "../../utils/sanitizeInput";
import bcrypt from "bcrypt";

// Admin function to create bouncer for a specific club
export const createBouncerAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { clubId } = req.params;
    
    // Normalize and sanitize email
    const sanitizedEmail = sanitizeInput(req.body.email?.toLowerCase().trim());
    const password = req.body.password;
    
    if (!sanitizedEmail) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }
    
    const email = sanitizedEmail;
    const userRepo = AppDataSource.getRepository(User);
    
    // Check if user already exists
    const existingUser = await userRepo.findOne({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new bouncer user
    const newBouncer = userRepo.create({
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      firstName: email.split('@')[0], // Use email prefix as first name
      role: "bouncer",
      clubId: clubId,
    });

    await userRepo.save(newBouncer);

    // Return user without sensitive information
    const { password: _, ...bouncerWithoutPassword } = newBouncer;
    res.status(201).json(bouncerWithoutPassword);
  } catch (error) {
    console.error("❌ Error creating bouncer:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};



// Admin function to delete bouncer
export const deleteBouncerAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const bouncerId = req.params.id;
    const userRepo = AppDataSource.getRepository(User);

    const bouncer = await userRepo.findOne({ where: { id: bouncerId, role: "bouncer" } });
    if (!bouncer) {
      res.status(404).json({ error: "Bouncer not found" });
      return;
    }

    await userRepo.remove(bouncer);
    res.status(200).json({ message: "Bouncer deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting bouncer:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}; 