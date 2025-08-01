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
import { OAuthService, GoogleUserInfo } from "../services/oauthService";
import { sanitizeInput } from "../utils/sanitizeInput";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const RESET_SECRET = process.env.RESET_SECRET || "dev-reset-secret";
const RESET_EXPIRY = "15m";

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const sanitizedEmail = sanitizeInput(req.body.email?.toLowerCase().trim());
    const password = req.body.password;
    
    if (!sanitizedEmail) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }
    
    const email = sanitizedEmail;

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
    const user = repo.create({ 
      email, 
      password: hashed, 
      role: "user",
      isOAuthUser: false
    });
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
  const sanitizedEmail = sanitizeInput(req.body.email?.toLowerCase().trim());
  const password = req.body.password;
  
  if (!sanitizedEmail) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }
  
  const email = sanitizedEmail;

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

  // Check if user has a password (not OAuth user)
  if (!user.password) {
    res.status(401).json({ error: "Please sign in with Google" });
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

// ================================
// GOOGLE OAUTH CONTROLLERS
// ================================

/**
 * GET /auth/google - Initiate Google OAuth flow
 */
export async function googleAuth(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // Check if required environment variables are set
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error('❌ Missing Google OAuth environment variables');
      res.status(500).json({ 
        error: "Google OAuth not configured",
        missing: [
          !process.env.GOOGLE_CLIENT_ID && 'GOOGLE_CLIENT_ID',
          !process.env.GOOGLE_CLIENT_SECRET && 'GOOGLE_CLIENT_SECRET',
          !process.env.GOOGLE_REDIRECT_URI && 'GOOGLE_REDIRECT_URI'
        ].filter(Boolean)
      });
      return;
    }

    // Pass sessionId in state to preserve cart during OAuth flow
    const sessionId = req.sessionId;
    console.log('🔍 Initiating Google OAuth flow:', {
      sessionId: sessionId || 'none',
      redirectUri: process.env.GOOGLE_REDIRECT_URI
    });
    
    const authUrl = OAuthService.getGoogleAuthUrl(sessionId || undefined);
    console.log('🔗 Redirecting to Google OAuth URL:', authUrl);
    
    res.redirect(authUrl);
  } catch (error) {
    console.error("❌ Error initiating Google OAuth:", error);
    res.status(500).json({ error: "Failed to initiate Google authentication" });
  }
}

/**
 * GET /auth/google/callback - Handle Google OAuth callback
 */
export async function googleCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code, state, error, error_description } = req.query;
    
    // Log all query parameters for debugging
    console.log('🔍 OAuth callback received:', {
      code: code ? 'present' : 'missing',
      state: state || 'none',
      error: error || 'none',
      error_description: error_description || 'none',
      allParams: req.query
    });
    
    // Handle OAuth errors from Google
    if (error) {
      console.error('❌ Google OAuth error:', error, error_description);
      res.redirect(`/clubs.html?error=oauth_${error}`);
      return;
    }
    
    if (!code) {
      console.error('❌ Missing authorization code in OAuth callback');
      res.status(400).json({ 
        error: "Missing authorization code",
        received_params: req.query,
        help: "This endpoint should only be accessed via Google OAuth flow. Start at /auth/google"
      });
      return;
    }

    // Verify Google token and get user info
    const googleUser = await OAuthService.verifyGoogleToken(code as string);
    
    if (!googleUser.emailVerified) {
      res.status(400).json({ error: "Google email not verified" });
      return;
    }

    // Check for disposable email
    if (isDisposableEmail(googleUser.email)) {
      res.status(403).json({ error: "Email domain not allowed" });
      return;
    }

    const userRepo = AppDataSource.getRepository(User);
    let user = await userRepo.findOneBy({ email: googleUser.email });

    if (user) {
      // Existing user - update OAuth info if not already set
      if (!user.isOAuthUser) {
        user.googleId = googleUser.googleId;
        user.firstName = googleUser.firstName;
        user.lastName = googleUser.lastName;
        user.avatar = googleUser.avatar;
        user.isOAuthUser = true;
        await userRepo.save(user);
      }
    } else {
      // New user - create with OAuth info
      user = userRepo.create({
        email: googleUser.email,
        googleId: googleUser.googleId,
        firstName: googleUser.firstName,
        lastName: googleUser.lastName,
        avatar: googleUser.avatar,
        role: "user",
        isOAuthUser: true,
      });
      await userRepo.save(user);
    }

    // Handle cart migration from sessionId (if exists)
    const sessionId = state as string;
    if (sessionId) {
      await clearAnonymousCart(sessionId);
    }

    // Get clubId for clubowner/bouncer/waiter
    let clubId: string | undefined = undefined;
    if (user.role === "clubowner") {
      const club = await AppDataSource.getRepository(Club).findOneBy({ ownerId: user.id });
      if (club) clubId = club.id;
    } else if (user.role === "bouncer" || user.role === "waiter") {
      clubId = user.clubId;
    }

    // Create JWT token
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

    // Set secure cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Clear sessionId cookie if it exists
    if (sessionId) {
      res.clearCookie("sessionId", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
    }

    // Redirect to success page
    const redirectUrl = `/clubs.html?oauth=success`; // Always redirect to our test page for now
    
    res.redirect(redirectUrl);

  } catch (error) {
    console.error("❌ Error in Google OAuth callback:", error);
    res.redirect(`/clubs.html?error=oauth_failed`);
  }
}

/**
 * POST /auth/google/token - Verify Google ID token (for frontend integration)
 */
export async function googleTokenAuth(req: Request, res: Response): Promise<void> {
  try {
    const { idToken } = req.body;
    const typedReq = req as AuthenticatedRequest;
    
    if (!idToken) {
      res.status(400).json({ error: "Missing Google ID token" });
      return;
    }

    // Verify Google ID token
    const googleUser = await OAuthService.verifyGoogleIdToken(idToken);
    
    if (!googleUser.emailVerified) {
      res.status(400).json({ error: "Google email not verified" });
      return;
    }

    // Check for disposable email
    if (isDisposableEmail(googleUser.email)) {
      res.status(403).json({ error: "Email domain not allowed" });
      return;
    }

    const userRepo = AppDataSource.getRepository(User);
    let user = await userRepo.findOneBy({ email: googleUser.email });

    if (user) {
      // Existing user - update OAuth info if not already set
      if (!user.isOAuthUser) {
        user.googleId = googleUser.googleId;
        user.firstName = googleUser.firstName;
        user.lastName = googleUser.lastName;
        user.avatar = googleUser.avatar;
        user.isOAuthUser = true;
        await userRepo.save(user);
      }
    } else {
      // New user - create with OAuth info
      user = userRepo.create({
        email: googleUser.email,
        googleId: googleUser.googleId,
        firstName: googleUser.firstName,
        lastName: googleUser.lastName,
        avatar: googleUser.avatar,
        role: "user",
        isOAuthUser: true,
      });
      await userRepo.save(user);
    }

    // Handle cart migration from sessionId
    const sessionId = typedReq.sessionId;
    if (sessionId) {
      await clearAnonymousCart(sessionId);
    }

    // Get clubId for clubowner/bouncer/waiter
    let clubId: string | undefined = undefined;
    if (user.role === "clubowner") {
      const club = await AppDataSource.getRepository(Club).findOneBy({ ownerId: user.id });
      if (club) clubId = club.id;
    } else if (user.role === "bouncer" || user.role === "waiter") {
      clubId = user.clubId;
    }

    // Create JWT token
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

    // Set secure cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Clear sessionId cookie
    if (sessionId) {
      res.clearCookie("sessionId", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
    }

    res.json({
      message: "Google authentication successful",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isOAuthUser: user.isOAuthUser,
        ...(clubId ? { clubId } : {}),
      },
    });

  } catch (error) {
    console.error("❌ Error in Google token authentication:", error);
    res.status(500).json({ error: "Failed to authenticate with Google" });
  }
}