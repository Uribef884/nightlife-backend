import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { TicketPurchase } from "../entities/TicketPurchase";
import { AuthenticatedRequest } from "../types/express";
import { validateTicketPurchase } from "../utils/validateQRUtils";

export async function previewTicketQR(
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
    const validation = await validateTicketPurchase(qrCode, user);

    if (!validation.isValid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const purchase = validation.purchase!;

    // Format response data
    const response = {
      used: purchase.isUsed,
      usedAt: purchase.usedAt,
      ticketName: purchase.ticket.name,
      eventDate: purchase.date,
      unitPrice: purchase.priceAtCheckout,
      purchaseDate: purchase.createdAt,
      clubId: purchase.clubId,
      purchaseId: purchase.id,
      buyerName: purchase.buyerName,
      buyerIdNumber: purchase.buyerIdNumber
    };

    res.json(response);
  } catch (error) {
    console.error("❌ Error previewing ticket QR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function confirmTicketQR(
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
    const validation = await validateTicketPurchase(qrCode, user);

    if (!validation.isValid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const purchase = validation.purchase!;

    // Check if already used
    if (purchase.isUsed) {
      res.status(410).json({ 
        error: "QR code already used",
        usedAt: purchase.usedAt
      });
      return;
    }

    // Mark as used
    const purchaseRepository = AppDataSource.getRepository(TicketPurchase);
    purchase.isUsed = true;
    purchase.usedAt = new Date();
    await purchaseRepository.save(purchase);

    // Format response data
    const response = {
      used: true,
      usedAt: purchase.usedAt,
      ticketName: purchase.ticket.name,
      eventDate: purchase.date,
      unitPrice: purchase.priceAtCheckout,
      purchaseDate: purchase.createdAt,
      clubId: purchase.clubId,
      purchaseId: purchase.id,
      buyerName: purchase.buyerName,
      buyerIdNumber: purchase.buyerIdNumber
    };

    res.json(response);
  } catch (error) {
    console.error("❌ Error confirming ticket QR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} 