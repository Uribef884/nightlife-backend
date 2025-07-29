import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { PurchaseTransaction } from "../entities/TicketPurchaseTransaction";
import { TicketPurchase } from "../entities/TicketPurchase";
import { ILike, Between } from "typeorm";
import { AuthenticatedRequest } from "../types/express";
import { startOfDay, endOfDay} from "date-fns";
import type { JwtPayload } from "../types/jwt";
import { MenuItemFromTicket } from "../entities/MenuItemFromTicket";

type Role = JwtPayload["role"];

// 🕵️ Helper to fetch menu items for a purchase
async function getMenuItemsForPurchase(purchaseId: string) {
  const repo = AppDataSource.getRepository(MenuItemFromTicket);
  const items = await repo.find({
    where: { ticketPurchaseId: purchaseId },
    relations: ["menuItem", "variant"]
  });
  return items.map(item => ({
    id: item.id,
    menuItemId: item.menuItemId,
    menuItemName: item.menuItem.name,
    variantId: item.variantId,
    variantName: item.variant?.name || null,
    quantity: item.quantity
  }));
}

// 🧩 Enhanced formatTransaction to include menu items if ticket includes them
async function formatTransactionWithMenu(tx: PurchaseTransaction, role: Role) {
  // For each purchase, if ticket.includesMenuItem, fetch menu items
  const purchases = await Promise.all(tx.purchases.map(async (p) => {
    let menuItems: Array<{
      id: string;
      menuItemId: string;
      menuItemName: string;
      variantId?: string;
      variantName: string | null;
      quantity: number;
    }> = [];
    if (p.ticket && p.ticket.includesMenuItem) {
      menuItems = await getMenuItemsForPurchase(p.id);
    }
    return {
      id: p.id,
      ticketId: p.ticketId,
      date: p.date,
      priceAtCheckout: p.priceAtCheckout,
      ticket: p.ticket,
      qrCodeEncrypted: p.qrCodeEncrypted,
      menuItems
    };
  }));

  const base = {
    id: tx.id,
    email: tx.email,
    date: tx.date,
    userId: tx.user?.id ?? null,
    clubId: tx.clubId,
    totalPaid: tx.totalPaid,
    purchases,
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
  const formatted = await Promise.all(results.map((tx) => formatTransactionWithMenu(tx, "user")));
  res.json(formatted);
};

export const getUserPurchaseById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const id = req.params.id;
  const txRepo = AppDataSource.getRepository(PurchaseTransaction);

  const tx = await txRepo.findOne({
    where: { id, user: { id: userId } },
    relations: ["purchases", "purchases.ticket"],
  });

  if (!tx) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(await formatTransactionWithMenu(tx, "user"));
};

// 🏢 Club Owner
export const getClubPurchases = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const clubId = req.user?.clubId;
  if (!clubId) {
    res.status(403).json({ error: "Unauthorized: No club ID associated with this user" });
    return;
  }
  const txs = await findTransactions({ clubId }, "clubowner", req.query);
  const formatted = await Promise.all(txs.map((tx) => formatTransactionWithMenu(tx, "clubowner")));
  res.json(formatted);
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
  res.json(await formatTransactionWithMenu(tx, "clubowner"));
};

export const validateTicketQR = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id;
  const user = req.user!;

  // 🛡 Only bouncers or clubowners (not admin, not outsiders)
  if (user.role === "admin" || !user.clubId) {
    res.status(403).json({ error: "Forbidden: You do not have access to validate this QR" });
    return;
  }

  // ✅ Require explicit POST body confirmation
  const { confirm } = req.body;
  if (confirm !== true) {
    res.status(400).json({ error: "Validation must be explicitly confirmed" });
    return;
  }

  const purchaseRepo = AppDataSource.getRepository(TicketPurchase);
  const ticket = await purchaseRepo.findOneBy({ id });

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // 🛡 Club isolation
  if (ticket.clubId !== user.clubId) {
    res.status(403).json({ error: "You cannot validate purchases from other clubs" });
    return;
  }

  // 📅 Date check
  const ticketDate = new Date(ticket.date).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (ticketDate !== today) {
    res.status(400).json({ error: "This ticket is not valid today" });
    return;
  }

  // 🔁 One-time use only
  if (ticket.isUsed) {
    res.status(400).json({ error: "This ticket has already been used and cannot be reused." });
    return;
  }

  // ✅ Mark as used — irreversible
  ticket.isUsed = true;
  ticket.usedAt = new Date();
  await purchaseRepo.save(ticket);

  res.json({
    message: "✅ Ticket successfully marked as used",
    usedAt: ticket.usedAt,
  });
};

// 🛡 Admin
export const getAllPurchasesAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const txs = await findTransactions({}, "admin", req.query);
  const formatted = await Promise.all(txs.map((tx) => formatTransactionWithMenu(tx, "admin")));
  res.json(formatted);
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
  res.json(await formatTransactionWithMenu(tx, "admin"));
};
