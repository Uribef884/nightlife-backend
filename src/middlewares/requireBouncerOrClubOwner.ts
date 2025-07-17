import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/express";

export function requireBouncerOrClubOwner(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  console.log("🔍 requireBouncerOrClubOwner middleware called");
  console.log("📍 URL:", req.url);
  console.log("📍 Method:", req.method);
  
  const user = req.user;
  console.log("👤 User:", user ? { id: user.id, role: user.role, email: user.email } : "No user");

  if (!user) {
    console.log("❌ No user found");
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (user.role !== "bouncer" && user.role !== "clubowner") {
    console.log("❌ Invalid role:", user.role, "- Expected: bouncer or clubowner");
    res.status(403).json({ error: "Bouncer or club owner privileges required" });
    return;
  }

  console.log("✅ Bouncer/ClubOwner access granted for role:", user.role);
  next();
} 