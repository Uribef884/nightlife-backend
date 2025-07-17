import { Request, Response } from "express";
import { getRepository } from "typeorm";
import { User } from "../entities/User";
import { Club } from "../entities/Club";
import { MenuPurchaseTransaction } from "../entities/MenuPurchaseTransaction";
import { TicketPurchase } from "../entities/TicketPurchase";
import { decryptQR, QRPayload } from "./decryptQR";

export async function validateClubAccess(
  user: { id: string; role: string; clubId?: string },
  clubId: string
): Promise<boolean> {
  // If user is waiter/bouncer, check if they belong to the club
  if (user.role === "waiter" || user.role === "bouncer") {
    return user.clubId === clubId;
  }

  // If user is clubowner, check if they own the club
  if (user.role === "clubowner") {
    const clubRepository = getRepository(Club);
    const club = await clubRepository.findOne({
      where: { id: clubId, ownerId: user.id }
    });
    return !!club;
  }

  return false;
}

export function checkDateIsToday(createdAt: Date): boolean {
  const today = new Date();
  const createdDate = new Date(createdAt);
  
  return (
    createdDate.getFullYear() === today.getFullYear() &&
    createdDate.getMonth() === today.getMonth() &&
    createdDate.getDate() === today.getDate()
  );
}

export function checkTicketDateIsValid(ticketDate: Date): boolean {
  const today = new Date();
  const eventDate = new Date(ticketDate);
  
  // Set both dates to start of day for accurate comparison
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const eventDateStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  
  // Ticket is valid if event date is today or in the future
  return eventDateStart >= todayStart;
}

export function validateQRType(type: string, expected: "menu" | "ticket"): boolean {
  return type === expected;
}

export async function validateMenuTransaction(
  qrCode: string,
  user: { id: string; role: string; clubId?: string }
): Promise<{
  isValid: boolean;
  transaction?: MenuPurchaseTransaction;
  error?: string;
}> {
  try {
    const payload = decryptQR(qrCode);

    if (!validateQRType(payload.type, "menu")) {
      return { isValid: false, error: "Invalid QR type for menu validation" };
    }

    if (!payload.id) {
      return { isValid: false, error: "Missing transaction ID in QR code" };
    }

    const transactionRepository = getRepository(MenuPurchaseTransaction);
    const transaction = await transactionRepository.findOne({
      where: { id: payload.id },
      relations: ["purchases", "purchases.menuItem", "purchases.variant"]
    });

    if (!transaction) {
      return { isValid: false, error: "Transaction not found" };
    }

    const hasAccess = await validateClubAccess(user, transaction.clubId);
    if (!hasAccess) {
      return { isValid: false, error: "Access denied to this club" };
    }

    return { isValid: true, transaction };
  } catch (error) {
    return { isValid: false, error: "Invalid QR code" };
  }
}

export async function validateTicketPurchase(
  qrCode: string,
  user: { id: string; role: string; clubId?: string }
): Promise<{
  isValid: boolean;
  purchase?: TicketPurchase;
  error?: string;
}> {
  try {
    const payload = decryptQR(qrCode);

    if (!validateQRType(payload.type, "ticket")) {
      return { isValid: false, error: "Invalid QR type for ticket validation" };
    }

    if (!payload.id) {
      return { isValid: false, error: "Missing purchase ID in QR code" };
    }

    const purchaseRepository = getRepository(TicketPurchase);
    const purchase = await purchaseRepository.findOne({
      where: { id: payload.id },
      relations: ["ticket", "club", "transaction"]
    });

    if (!purchase) {
      return { isValid: false, error: "Purchase not found" };
    }

    const hasAccess = await validateClubAccess(user, purchase.clubId);
    if (!hasAccess) {
      return { isValid: false, error: "Access denied to this club" };
    }

    // Check if ticket date is valid (not in the past)
    if (!checkTicketDateIsValid(purchase.date)) {
      return { isValid: false, error: "Ticket is for a past event/date" };
    }

    return { isValid: true, purchase };
  } catch (error) {
    return { isValid: false, error: "Invalid QR code" };
  }
} 