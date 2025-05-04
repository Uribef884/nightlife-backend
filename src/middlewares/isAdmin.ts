import { Request, Response, NextFunction } from "express";

export function isAdmin(req: Request, res: Response, next: NextFunction): void {
    const user = req.user;
  
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "Admin privileges required" });
      return;
    }
  
    next();
  }
