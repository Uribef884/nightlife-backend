import { Response } from "express";
// @ts-ignore
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { AppDataSource } from "../config/data-source";
import { TicketPurchase } from "../entities/TicketPurchase";
import { Club } from "../entities/Club";

export const getClubOrders = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const clubRepo = AppDataSource.getRepository(Club);
  const purchaseRepo = AppDataSource.getRepository(TicketPurchase);

  const club = await clubRepo.findOne({
    where: { ownerId: userId },
    relations: ["tickets"],
  });

  if (!club) {
    return res.status(403).json({ error: "Access denied" });
  }

  const orders = await purchaseRepo.find({
    where: { ticket: { club: { id: club.id } } },
    relations: ["ticket", "user"],
    order: { createdAt: "DESC" },
  });

  res.json(orders);
};

export const getClubOrderById = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const orderId = req.params.id;

  const clubRepo = AppDataSource.getRepository(Club);
  const purchaseRepo = AppDataSource.getRepository(TicketPurchase);

  const club = await clubRepo.findOne({
    where: { ownerId: userId },
    relations: ["tickets"],
  });

  if (!club) {
    return res.status(403).json({ error: "Access denied" });
  }

  const order = await purchaseRepo.findOne({
    where: { id: orderId },
    relations: ["ticket", "user", "ticket.club"],
  });

  if (!order || order.ticket.club.id !== club.id) {
    return res.status(404).json({ error: "Order not found or unauthorized" });
  }

  res.json(order);
};
