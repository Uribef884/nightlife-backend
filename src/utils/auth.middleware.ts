import { Request, Response, NextFunction } from "express";

const API_KEY = process.env.ADMIN_API_KEY;

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
    res.status(403).json({ error: "Unauthorized" });
    return; 
  }

  next(); 
}
