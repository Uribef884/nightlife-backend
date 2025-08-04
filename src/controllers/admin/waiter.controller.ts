import { Request, Response } from "express";
import { AppDataSource } from "../../config/data-source";
import { User } from "../../entities/User";
import { AuthenticatedRequest } from "../../types/express";
import { sanitizeInput, sanitizeObject } from "../../utils/sanitizeInput";
import bcrypt from "bcrypt";

// Admin function to create waiter for a specific club
export const createWaiterAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    // Create new waiter user
    const newWaiter = userRepo.create({
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      firstName: email.split('@')[0], // Use email prefix as first name
      role: "waiter",
      clubId: clubId,
    });

    await userRepo.save(newWaiter);

    // Return user without sensitive information
    const { password: _, ...waiterWithoutPassword } = newWaiter;
    res.status(201).json(waiterWithoutPassword);
  } catch (error) {
    console.error("❌ Error creating waiter:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};



// Admin function to delete waiter
export const deleteWaiterAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const waiterId = req.params.id;
    const userRepo = AppDataSource.getRepository(User);

    const waiter = await userRepo.findOne({ where: { id: waiterId, role: "waiter" } });
    if (!waiter) {
      res.status(404).json({ error: "Waiter not found" });
      return;
    }

    await userRepo.remove(waiter);
    res.status(200).json({ message: "Waiter deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting waiter:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}; 