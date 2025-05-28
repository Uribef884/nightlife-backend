import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret"; // adjust as needed

export const optionalAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const token =
    req.cookies?.token ||
    req.headers["authorization"]?.toString().replace("Bearer ", "");

  if (!token) {
    // No token → allow request to proceed unauthenticated
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded; // Attach user to request
  } catch (err) {
    console.warn("Invalid token provided, ignoring it.");
  }

  next();
};
