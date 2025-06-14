import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuPurchaseTransaction } from "../entities/MenuPurchaseTransaction";
import { MenuPurchase } from "../entities/MenuPurchase";
import { ILike, Between } from "typeorm";
import { AuthenticatedRequest } from "../types/express";
import { JwtPayload } from "../types/jwt";

type Role = JwtPayload["role"];

function formatTransaction(tx: MenuPurchaseTransaction, role: Role) {
  const base = {
    id: tx.id,
    email: tx.email,
    userId: tx.user?.id ?? null,
    clubId: tx.clubId,
    createdAt: tx.createdAt,
    purchases: tx.purchases.map((p) => ({
      id: p.id,
      menuItem: p.menuItem,
      variant: p.variant ?? null,
      quantity: p.quantity,
      pricePerUnit: p.pricePerUnit,
    })),
  };

  if (role === "admin") {
    return {
      ...base,
      totalPaid: tx.totalPaid,
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
      totalPaid: tx.totalPaid,
      clubReceives: tx.clubReceives,
      platformReceives: tx.platformReceives,
    };
  }

  return base;
}

async function findMenuTransactions(where: any, role: Role, query: any): Promise<MenuPurchaseTransaction[]> {
  const txRepo = AppDataSource.getRepository(MenuPurchaseTransaction);
  const filters: any = { ...where };

  if (query.startDate && query.endDate) {
    filters.createdAt = Between(new Date(query.startDate), new Date(query.endDate));
  }

  if (query.email) {
    filters.email = ILike(`%${query.email.trim()}%`);
  }

  if (query.userId) {
    filters.user = { id: query.userId };
  }

  if (role === "admin" && query.clubId) {
    filters.clubId = query.clubId;
  }

  if (query.orderId) {
    filters.id = query.orderId;
  }

  const transactions = await txRepo.find({
    where: filters,
    relations: ["user", "purchases", "purchases.menuItem", "purchases.variant"],
    order: { createdAt: "DESC" },
  });

  return transactions;
}

// 🧑 Normal User
export const getUserMenuPurchases = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const results = await findMenuTransactions({ user: { id: userId } }, "user", req.query);
  res.json(results.map((tx) => formatTransaction(tx, "user")));
};

export const getUserMenuPurchaseById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id;
  const userId = req.user!.id;
  const txRepo = AppDataSource.getRepository(MenuPurchaseTransaction);

  const tx = await txRepo.findOne({
    where: { id, user: { id: userId } },
    relations: ["purchases", "purchases.menuItem", "purchases.variant"],
  });

  if (!tx)  {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(formatTransaction(tx, "user"));
};

// 🏢 Club Owner
export const getClubMenuPurchases = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const clubId = req.user?.clubId;
  if (!clubId)  {
    res.status(403).json({ error: "No club ID assigned" });
    return;
  }

  const txs = await findMenuTransactions({ clubId }, "clubowner", req.query);
  res.json(txs.map((tx) => formatTransaction(tx, "clubowner")));
};

export const getClubMenuPurchaseById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id;
  const clubId = req.user?.clubId;
  const txRepo = AppDataSource.getRepository(MenuPurchaseTransaction);

  const tx = await txRepo.findOne({
    where: { id, clubId },
    relations: ["purchases", "purchases.menuItem", "purchases.variant"],
  });

  if (!tx) {
    res.status(404).json({ error: "Not found or unauthorized" });
    return;
  }
  res.json(formatTransaction(tx, "clubowner"));
};

// 🛡 Admin
export const getAllMenuPurchasesAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const txs = await findMenuTransactions({}, "admin", req.query);
  res.json(txs.map((tx) => formatTransaction(tx, "admin")));
};

export const getMenuPurchaseByIdAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id;
  const txRepo = AppDataSource.getRepository(MenuPurchaseTransaction);

  const tx = await txRepo.findOne({
    where: { id },
    relations: ["purchases", "purchases.menuItem", "purchases.variant"],
  });

  if (!tx) {
    res.status(404).json({ error: "Not found" });
    return;
  } 
  res.json(formatTransaction(tx, "admin"));
};
