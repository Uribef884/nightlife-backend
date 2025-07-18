import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { Club } from "../entities/Club";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { isDisposableEmail } from "../utils/disposableEmailValidator";
import { clearAnonymousCart } from "../utils/clearAnonymousCart";
import { AuthenticatedRequest } from "../types/express";
import { CartItem } from "../entities/TicketCartItem";
import { authSchemaRegister } from "../schemas/auth.schema";
import { forgotPasswordSchema, resetPasswordSchema } from "../schemas/forgot.schema";
import { sendPasswordResetEmail } from "../services/emailService"; 
import { MenuCartItem } from "../entities/MenuCartItem";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const RESET_SECRET = process.env.RESET_SECRET || "dev-reset-secret";
const RESET_EXPIRY = "15m";

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const email = req.body.email?.toLowerCase().trim();
    const password = req.body.password;

    const result = authSchemaRegister.safeParse({ email, password });

    if (!result.success) {
      res.status(400).json({
        error: "Invalid input",
        details: result.error.flatten(),
      });
      return;
    }

    if (isDisposableEmail(email)) {
      res.status(403).json({ error: "Email domain not allowed" });
      return;
    }

    const repo = AppDataSource.getRepository(User);
    const existing = await repo.findOneBy({ email });
    if (existing) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = repo.create({ email, password: hashed, role: "user" });
    await repo.save(user);

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error("❌ Error in register:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const email = req.body.email?.toLowerCase().trim();
  const password = req.body.password;

  if (!email || !password) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const repo = AppDataSource.getRepository(User);
  const user = await repo.findOneBy({ email });

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Clear anonymous cart
  const typedReq = req as AuthenticatedRequest;
  // Get sessionId directly from cookies, not from middleware-processed req.sessionId
  const sessionId = req.cookies?.sessionId;

  if (sessionId) {
    await clearAnonymousCart(sessionId);
    res.clearCookie("sessionId", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
  }

  let clubId: string | undefined = undefined;
  if (user.role === "clubowner") {
    const club = await AppDataSource.getRepository(Club).findOneBy({ ownerId: user.id });
    if (club) clubId = club.id;
  } else if (user.role === "bouncer" || user.role === "waiter") {
    clubId = user.clubId;
  }

  const token = jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
      ...(clubId ? { clubId } : {}),
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    message: "Login successful",
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      ...(clubId ? { clubId } : {}),
    },
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const typedReq = req as AuthenticatedRequest;
  const sessionId = !typedReq.user?.id && typedReq.sessionId ? typedReq.sessionId : null;
  const userId = (req as AuthenticatedRequest).user?.id;

  const cartRepo = AppDataSource.getRepository(CartItem);
  const menuCartRepo = AppDataSource.getRepository(MenuCartItem);

  try {
    if (userId) {
      await cartRepo.delete({ userId });
      await menuCartRepo.delete({ userId });
      res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
    }

    if (sessionId) {
      await clearAnonymousCart(sessionId);
      res.clearCookie("sessionId", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("❌ Error during logout:", error);
    res.status(500).json({ error: "Error while logging out" });
  }
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await userRepo.remove(user);
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteOwnUser(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOneBy({ id: userId });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await repo.remove(user);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }

}

export async function updateUserRole(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!["clubowner", "bouncer", "user"].includes(role)) {
      res.status(400).json({ error: "Invalid role. Allowed roles: user, clubowner, bouncer." });
      return;
    }

    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOneBy({ id });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.role === "admin") {
      res.status(403).json({ error: "Cannot change role of an admin via API" });
      return;
    }

    user.role = role;
    await repo.save(user);

    res.json({ message: `User role updated to ${role}` });
  } catch (error) {
    console.error("❌ Error updating user role:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const result = forgotPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(200).json({ message: "Reset link has been sent." });
    return;
  }

  const { email } = result.data;
  const user = await AppDataSource.getRepository(User).findOneBy({ email });
  if (!user) {
    res.status(200).json({ message: "Reset link has been sent." });
    return;
  }

  const token = jwt.sign({ id: user.id }, RESET_SECRET, { expiresIn: RESET_EXPIRY });
  await sendPasswordResetEmail(user.email, token);

  res.status(200).json({ message: "Reset link has been sent." });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const result = resetPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { token, newPassword } = result.data;

  try {
    const payload = jwt.verify(token, RESET_SECRET) as { id: string };
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOneBy({ id: payload.id });

    if (!user) {
      res.status(400).json({ error: "Invalid token or user" });
      return;
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await repo.save(user);

    res.status(200).json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("❌ Error resetting password:", err);
    res.status(400).json({ error: "Invalid or expired token" });
  }
}

export const getCurrentUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const user = req.user;

  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const { id, email, role, clubId } = user;
  res.json({ id, email, role, clubId });
};