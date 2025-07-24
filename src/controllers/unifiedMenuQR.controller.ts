import { Response } from "express";
import { AuthenticatedRequest } from "../types/express";
import { decryptQR } from "../utils/decryptQR";
import { validateMenuTransaction, validateMenuFromTicketPurchase } from "../utils/validateQRUtils";
import { AppDataSource } from "../config/data-source";
import { MenuPurchaseTransaction } from "../entities/MenuPurchaseTransaction";
import { TicketPurchase } from "../entities/TicketPurchase";
import { MenuItemFromTicket } from "../entities/MenuItemFromTicket";

export async function previewUnifiedMenuQR(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { qrCode } = req.body;
    if (!qrCode) {
      res.status(400).json({ error: "QR code is required" });
      return;
    }
    let payload;
    try {
      payload = decryptQR(qrCode);
    } catch (err) {
      res.status(400).json({ error: "Invalid QR code" });
      return;
    }
    const user = req.user!;
    if (payload.type === "menu") {
      // Standalone menu QR
      const validation = await validateMenuTransaction(qrCode, user);
      if (!validation.isValid) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const transaction = validation.transaction!;
      const response = {
        used: transaction.isUsed,
        usedAt: transaction.usedAt,
        items: transaction.purchases.map(purchase => ({
          itemName: purchase.menuItem.name,
          variant: purchase.variant?.name || null,
          quantity: purchase.quantity,
          unitPrice: purchase.pricePerUnit
        })),
        totalPaid: transaction.totalPaid,
        purchaseDate: transaction.createdAt,
        clubId: transaction.clubId,
        transactionId: transaction.id
      };
      res.json(response);
    } else if (payload.type === "menu_from_ticket") {
      // Menu QR from ticket
      const validation = await validateMenuFromTicketPurchase(qrCode, user);
      if (!validation.isValid) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const purchase = validation.purchase!;
      const menuItemFromTicketRepo = AppDataSource.getRepository(MenuItemFromTicket);
      const menuItems = await menuItemFromTicketRepo.find({
        where: { ticketPurchaseId: purchase.id },
        relations: ["menuItem", "variant"]
      });
      const response = {
        used: purchase.isUsedMenu,
        usedAt: purchase.menuQRUsedAt,
        ticketName: purchase.ticket.name,
        eventDate: purchase.date,
        items: menuItems.map(item => ({
          itemName: item.menuItem.name,
          variant: item.variant?.name || null,
          quantity: item.quantity
        })),
        purchaseDate: purchase.createdAt,
        clubId: purchase.clubId,
        purchaseId: purchase.id,
        buyerName: purchase.buyerName,
        buyerIdNumber: purchase.buyerIdNumber
      };
      res.json(response);
    } else {
      res.status(400).json({ error: "Unsupported QR type" });
    }
  } catch (error) {
    console.error("❌ Error previewing unified menu QR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function confirmUnifiedMenuQR(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { qrCode } = req.body;
    if (!qrCode) {
      res.status(400).json({ error: "QR code is required" });
      return;
    }
    let payload;
    try {
      payload = decryptQR(qrCode);
    } catch (err) {
      res.status(400).json({ error: "Invalid QR code" });
      return;
    }
    const user = req.user!;
    if (payload.type === "menu") {
      // Standalone menu QR
      const validation = await validateMenuTransaction(qrCode, user);
      if (!validation.isValid) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const transaction = validation.transaction!;
      if (transaction.isUsed) {
        res.status(410).json({
          error: "QR code already used",
          usedAt: transaction.usedAt
        });
        return;
      }
      const transactionRepository = AppDataSource.getRepository(MenuPurchaseTransaction);
      transaction.isUsed = true;
      transaction.usedAt = new Date();
      await transactionRepository.save(transaction);
      const response = {
        used: true,
        usedAt: transaction.usedAt,
        items: transaction.purchases.map(purchase => ({
          itemName: purchase.menuItem.name,
          variant: purchase.variant?.name || null,
          quantity: purchase.quantity,
          unitPrice: purchase.pricePerUnit
        })),
        totalPaid: transaction.totalPaid,
        purchaseDate: transaction.createdAt,
        clubId: transaction.clubId,
        transactionId: transaction.id
      };
      res.json(response);
    } else if (payload.type === "menu_from_ticket") {
      // Menu QR from ticket
      const validation = await validateMenuFromTicketPurchase(qrCode, user);
      if (!validation.isValid) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const purchase = validation.purchase!;
      if (purchase.isUsedMenu) {
        res.status(410).json({
          error: "Menu QR code already used",
          usedAt: purchase.menuQRUsedAt
        });
        return;
      }
      const purchaseRepository = AppDataSource.getRepository(TicketPurchase);
      purchase.isUsedMenu = true;
      purchase.menuQRUsedAt = new Date();
      await purchaseRepository.save(purchase);
      const menuItemFromTicketRepo = AppDataSource.getRepository(MenuItemFromTicket);
      const menuItems = await menuItemFromTicketRepo.find({
        where: { ticketPurchaseId: purchase.id },
        relations: ["menuItem", "variant"]
      });
      const response = {
        used: true,
        usedAt: purchase.menuQRUsedAt,
        ticketName: purchase.ticket.name,
        eventDate: purchase.date,
        items: menuItems.map(item => ({
          itemName: item.menuItem.name,
          variant: item.variant?.name || null,
          quantity: item.quantity
        })),
        purchaseDate: purchase.createdAt,
        clubId: purchase.clubId,
        purchaseId: purchase.id,
        buyerName: purchase.buyerName,
        buyerIdNumber: purchase.buyerIdNumber
      };
      res.json(response);
    } else {
      res.status(400).json({ error: "Unsupported QR type" });
    }
  } catch (error) {
    console.error("❌ Error confirming unified menu QR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} 