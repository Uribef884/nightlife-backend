import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/express";

export function isAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const user = req.user;
  
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "Admin privileges required" });
      return;
    }
  
    next();
  }
