import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { TicketPurchase } from "../entities/TicketPurchase";
import { MenuItemFromTicket } from "../entities/MenuItemFromTicket";
import { AuthenticatedRequest } from "../types/express";
import { validateMenuFromTicketPurchase } from "../utils/validateQRUtils";

export async function previewMenuFromTicketQR(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { qrCode } = req.body;

    if (!qrCode) {
      res.status(400).json({ error: "QR code is required" });
      return;
    }

    const user = req.user!;
    const validation = await validateMenuFromTicketPurchase(qrCode, user);

    if (!validation.isValid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const purchase = validation.purchase!;

    // Get the menu items for this ticket purchase
    const menuItemFromTicketRepo = AppDataSource.getRepository(MenuItemFromTicket);
    const menuItems = await menuItemFromTicketRepo.find({
      where: { ticketPurchaseId: purchase.id },
      relations: ["menuItem", "variant"]
    });

    // Format response data
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
  } catch (error) {
    console.error("❌ Error previewing menu from ticket QR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function confirmMenuFromTicketQR(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { qrCode } = req.body;

    if (!qrCode) {
      res.status(400).json({ error: "QR code is required" });
      return;
    }

    const user = req.user!;
    const validation = await validateMenuFromTicketPurchase(qrCode, user);

    if (!validation.isValid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const purchase = validation.purchase!;

    // Check if already used
    if (purchase.isUsedMenu) {
      res.status(410).json({ 
        error: "Menu QR code already used",
        usedAt: purchase.menuQRUsedAt
      });
      return;
    }

    // Mark as used
    const purchaseRepository = AppDataSource.getRepository(TicketPurchase);
    purchase.isUsedMenu = true;
    purchase.menuQRUsedAt = new Date();
    await purchaseRepository.save(purchase);

    // Get the menu items for this ticket purchase
    const menuItemFromTicketRepo = AppDataSource.getRepository(MenuItemFromTicket);
    const menuItems = await menuItemFromTicketRepo.find({
      where: { ticketPurchaseId: purchase.id },
      relations: ["menuItem", "variant"]
    });

    // Format response data
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
  } catch (error) {
    console.error("❌ Error confirming menu from ticket QR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} 