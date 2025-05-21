import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export const attachSessionId = (req: Request, res: Response, next: NextFunction) => {
  const cookieName = "sessionId";
  let sessionId = req.cookies?.[cookieName];

  if (!sessionId) {
    sessionId = uuidv4(); // generate new UUID
    res.cookie(cookieName, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS only in prod
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax",
    });
  }

  // Attach sessionId to request
  (req as any).sessionId = sessionId;
  next();
};
