import { Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuPurchaseTransaction } from "../entities/MenuPurchaseTransaction";
import { AuthenticatedRequest } from "../types/express";
import { validateMenuTransaction } from "../utils/validateQRUtils";

export async function previewMenuQR(
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
    const validation = await validateMenuTransaction(qrCode, user);

    if (!validation.isValid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const transaction = validation.transaction!;

    // Format response data for the entire transaction
    const response = {
      used: transaction.isUsed,
      usedAt: transaction.usedAt,
      items: transaction.purchases.map(purchase => ({
        itemName: purchase.menuItem.name,
        variant: purchase.variant?.name || null,
        quantity: purchase.quantity,
        unitPrice: purchase.priceAtCheckout
      })),
      totalPaid: transaction.totalPaid,
      purchaseDate: transaction.createdAt,
      clubId: transaction.clubId,
      transactionId: transaction.id
    };

    res.json(response);
  } catch (error) {
    console.error("❌ Error previewing menu QR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function confirmMenuQR(
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
    const validation = await validateMenuTransaction(qrCode, user);

    if (!validation.isValid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const transaction = validation.transaction!;

    // Check if already used
    if (transaction.isUsed) {
      res.status(410).json({ 
        error: "QR code already used",
        usedAt: transaction.usedAt
      });
      return;
    }

    // Mark as used
    const transactionRepository = AppDataSource.getRepository(MenuPurchaseTransaction);
    transaction.isUsed = true;
    transaction.usedAt = new Date();
    await transactionRepository.save(transaction);

    // Format response data for the entire transaction
    const response = {
      used: true,
      usedAt: transaction.usedAt,
      items: transaction.purchases.map(purchase => ({
        itemName: purchase.menuItem.name,
        variant: purchase.variant?.name || null,
        quantity: purchase.quantity,
        unitPrice: purchase.priceAtCheckout
      })),
      totalPaid: transaction.totalPaid,
      purchaseDate: transaction.createdAt,
      clubId: transaction.clubId,
      transactionId: transaction.id
    };

    res.json(response);
  } catch (error) {
    console.error("❌ Error confirming menu QR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
} 