import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import { JwtPayload } from "../types/jwt"; // your shared type

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export const attachSessionId = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.token;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      req.user = {
        id: decoded.id,
        role: decoded.role,
        email: decoded.email,
        clubId: decoded.clubId ?? undefined,
      };
      return next(); // ✅ Do not assign sessionId if user is logged in
    } catch (err) {
      console.warn("⚠️ Invalid token in attachSessionId");
    }
  }

  const cookieName = "sessionId";
  let sessionId = req.cookies?.[cookieName];

  if (!sessionId) {
    sessionId = uuidv4();
    res.cookie(cookieName, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax",
    });
  }

  (req as any).sessionId = sessionId;
  next();
};
