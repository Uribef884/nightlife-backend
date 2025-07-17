import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/express";

export function requireWaiterOrClubOwner(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  console.log("🔍 requireWaiterOrClubOwner middleware called");
  console.log("📍 URL:", req.url);
  console.log("📍 Method:", req.method);
  
  const user = req.user;
  console.log("👤 User:", user ? { id: user.id, role: user.role, email: user.email } : "No user");

  if (!user) {
    console.log("❌ No user found");
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (user.role !== "waiter" && user.role !== "clubowner") {
    console.log("❌ Invalid role:", user.role, "- Expected: waiter or clubowner");
    res.status(403).json({ error: "Waiter or club owner privileges required" });
    return;
  }

  console.log("✅ Waiter/ClubOwner access granted for role:", user.role);
  next();
} 