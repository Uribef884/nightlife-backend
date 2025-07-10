import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import { JwtPayload } from "../types/jwt";
import { AuthenticatedRequest } from "../types/express"; // ✅ use this to type req properly

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export const attachSessionId = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
      req.sessionId = null; // ✅ explicitly nullify sessionId if user is logged in
      return next();
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
      secure: req.secure || req.headers["x-forwarded-proto"] === "https", // ✅ support ngrok
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax",
    });
  }

  req.sessionId = sessionId; // ✅ always defined, even if user is logged in it's null
  next();
};
