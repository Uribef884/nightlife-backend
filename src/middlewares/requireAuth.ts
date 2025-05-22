import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest } from "../types/express";
import { JwtPayload } from "../types/jwt";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void { // ✅ fixed from `unknown` to `void`
  const token = req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
      clubId: decoded.clubId ?? undefined,
    };

    next();
  } catch (err) {
    console.error("❌ Invalid token:", err);
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
