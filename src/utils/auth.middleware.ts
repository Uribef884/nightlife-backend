import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/express"; 


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

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }

  next();
};