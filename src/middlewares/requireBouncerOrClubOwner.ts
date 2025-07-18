import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/express";

export function requireBouncerOrClubOwner(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const user = req.user;

  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (user.role !== "bouncer" && user.role !== "clubowner") {
    res.status(403).json({ error: "Bouncer or club owner privileges required" });
    return;
  }

  next();
} 