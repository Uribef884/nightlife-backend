import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { PurchaseTransaction } from "../entities/PurchaseTransaction";
import { ILike, Between } from "typeorm";
import { AuthenticatedRequest } from "../types/express";
import type { JwtPayload } from "../types/jwt";

type Role = JwtPayload["role"];

// 👁 Filter response by role
function formatTransaction(tx: PurchaseTransaction, role: Role) {
  const base = {
    id: tx.id,
    email: tx.email,
    date: tx.date,
    userId: tx.userId,
    clubId: tx.clubId,
    totalPaid: tx.totalPaid,
    purchases: tx.purchases.map((p) => ({
      id: p.id,
      ticketId: p.ticketId,
      date: p.date,
      userPaid: p.userPaid,
      ticket: p.ticket,
      qrCodeEncrypted: p.qrCodeEncrypted,
    })),
  };

  if (role === "admin") {
    return {
      ...base,
      clubReceives: tx.clubReceives,
      platformReceives: tx.platformReceives,
      gatewayFee: tx.gatewayFee,
      gatewayIVA: tx.gatewayIVA,
      retentionICA: tx.retentionICA,
      retentionIVA: tx.retentionIVA,
      retentionFuente: tx.retentionFuente,
    };
  }

  if (role === "clubowner") {
    return {
      ...base,
      clubReceives: tx.clubReceives,
      platformReceives: tx.platformReceives,
    };
  }

  return base;
}

// 📦 Base reusable filter
async function findTransactions(where: any, role: Role, query: any): Promise<PurchaseTransaction[]> {
  const txRepo = AppDataSource.getRepository(PurchaseTransaction);
  const filters: any = { ...where };

  if (query.startDate && query.endDate) {
    filters.date = Between(query.startDate, query.endDate);
  }

  if (query.email) {
    filters.email = ILike(`%${query.email.trim()}%`);
  }

  if (query.userId) {
    filters.userId = query.userId;
  }

  if (role === "admin" && query.clubId) {
    filters.clubId = query.clubId;
  }

  if (query.orderId) {
    filters.id = query.orderId;
  }

  const transactions = await txRepo.find({
    where: filters,
    relations: ["purchases", "purchases.ticket"],
    order: { date: "DESC" },
  });

  // Optional ticket name filter (club owner only)
  if (query.ticketType && role === "clubowner") {
    return transactions.filter((tx) =>
      tx.purchases.some((p) =>
        p.ticket.name.toLowerCase().includes(query.ticketType.toLowerCase())
      )
    );
  }

  return transactions;
}

// 🧑 Normal User
export const getUserPurchases = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const results = await findTransactions({ userId }, "user", req.query);
  res.json(results.map((tx) => formatTransaction(tx, "user")));
};

export const getUserPurchaseById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const id = req.params.id;
  const txRepo = AppDataSource.getRepository(PurchaseTransaction);

  const tx = await txRepo.findOne({
    where: { id, userId },
    relations: ["purchases", "purchases.ticket"],
  });

  if (!tx) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(formatTransaction(tx, "user"));
};

// 🏢 Club Owner
export const getClubPurchases = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const clubId = req.user?.clubId;

  if (!clubId) {
    res.status(403).json({ error: "Unauthorized: No club ID associated with this user" });
    return;
  }

  const txs = await findTransactions({ clubId }, "clubowner", req.query);
  res.json(txs.map((tx) => formatTransaction(tx, "clubowner")));
};

export const getClubPurchaseById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const clubId = req.user!.clubId!;
  const id = req.params.id;
  const txRepo = AppDataSource.getRepository(PurchaseTransaction);

  const tx = await txRepo.findOne({
    where: { id, clubId },
    relations: ["purchases", "purchases.ticket"],
  });

  if (!tx) {
    res.status(404).json({ error: "Not found or unauthorized" });
    return;
  }

  res.json(formatTransaction(tx, "clubowner"));
};

// 🛡 Admin
export const getAllPurchasesAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const txs = await findTransactions({}, "admin", req.query);
  res.json(txs.map((tx) => formatTransaction(tx, "admin")));
};

export const getPurchaseByIdAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id;
  const txRepo = AppDataSource.getRepository(PurchaseTransaction);

  const tx = await txRepo.findOne({
    where: { id },
    relations: ["purchases", "purchases.ticket"],
  });

  if (!tx) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(formatTransaction(tx, "admin"));
};
