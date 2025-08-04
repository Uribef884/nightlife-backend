import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest } from "../types/express";

export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  const tokenFromCookie = req.cookies?.token;

  const token = tokenFromHeader || tokenFromCookie;

  if (!token) {
    res.status(401).json({ error: "Missing or invalid token" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    // Check if user account is deleted from JWT token
    if (decoded.isDeleted) {
      res.status(401).json({ error: "Account has been deleted" });
      return;
    }

    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
      clubId: decoded.clubId,
    };

    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

export const requireAdminAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const user = req.user;

  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Forbidden: Admins only" });
    return;
  }

  next();
};

export const requireClubOwnerOrAdmin = (req: Request, res: Response, next: NextFunction): void => {
  // @ts-ignore — injected in authMiddleware
  const user = req.user;

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (user.role === "admin" || user.role === "clubowner") {
    next();
    return;
  }

  res.status(403).json({ error: "Forbidden: You are not authorized" });
};

export const requireClubOwnerAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const user = req.user;

  if (!user || user.role !== "clubowner") {
    res.status(403).json({ error: "Forbidden: Club owners only" });
    return;
  }

  next();
};