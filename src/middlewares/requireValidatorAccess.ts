import { Response, NextFunction } from "express";
import { AppDataSource } from "../config/data-source";
import { TicketPurchase } from "../entities/TicketPurchase";
import { AuthenticatedRequest } from "../types/express";

export const requireValidatorAccess = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = req.user;
  const purchaseId = req.params.id;

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const purchaseRepo = AppDataSource.getRepository(TicketPurchase);
  const purchase = await purchaseRepo.findOne({
    where: { id: purchaseId },
    relations: ["ticket"],
  });

  if (!purchase) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Allow admins always
  if (user.role === "admin") {
    return next();
  }

  // Allow clubowner/bouncer only if their clubId matches
  if (
    (user.role === "clubowner" || user.role === "bouncer") &&
    user.clubId === purchase.ticket.clubId
  ) {
    return next();
  }

  res.status(403).json({ error: "Forbidden: You do not have access to validate this QR" });
};
