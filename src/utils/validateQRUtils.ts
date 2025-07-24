import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
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
    const clubRepository = AppDataSource.getRepository(Club);
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
  // Get current time in Colombia timezone (UTC-5)
  const nowUTC = new Date();
  const colombiaOffset = -5 * 60; // Colombia is UTC-5
  const nowColombia = new Date(nowUTC.getTime() + (colombiaOffset * 60 * 1000));
  
  // Handle date properly to avoid timezone conversion issues
  const eventDateValue = ticketDate as any;
  let year: number, month: number, day: number;
  
  if (typeof eventDateValue === 'string') {
    // Parse string date (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
    const dateStr = eventDateValue.includes('T') ? eventDateValue.split('T')[0] : eventDateValue;
    [year, month, day] = dateStr.split('-').map(Number);
  } else if (eventDateValue instanceof Date) {
    // Extract components from Date object
    year = eventDateValue.getFullYear();
    month = eventDateValue.getMonth() + 1; // getMonth() returns 0-11
    day = eventDateValue.getDate();
  } else {
    // Fallback
    const dateStr = String(eventDateValue).split('T')[0];
    [year, month, day] = dateStr.split('-').map(Number);
  }
  
  // Create event start and end times using the parsed components
  const eventStart = new Date(year, month - 1, day, 0, 0, 0); // Start of day
  const eventEnd = new Date(year, month - 1, day + 1, 1, 0, 0); // 1 AM next day
  
  // Current time should be between event start and event end (1 AM next day)
  return nowColombia >= eventStart && nowColombia <= eventEnd;
}

export function validateQRType(type: string, expected: "menu" | "ticket" | "menu_from_ticket"): boolean {
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

    const transactionRepository = AppDataSource.getRepository(MenuPurchaseTransaction);
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

    const purchaseRepository = AppDataSource.getRepository(TicketPurchase);
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

    // Check if ticket date is valid (only valid on event date until 1 AM next day)
    if (!checkTicketDateIsValid(purchase.date)) {
      // Handle date properly to avoid timezone issues
      const eventDateValue = purchase.date as any; // TypeORM can return date as string or Date
      let eventDateStr: string;
      
      if (typeof eventDateValue === 'string') {
        // If it's a string, extract just the date part (YYYY-MM-DD)
        eventDateStr = eventDateValue.includes('T') ? eventDateValue.split('T')[0] : eventDateValue;
      } else if (eventDateValue instanceof Date) {
        // If it's a Date object, format it properly
        eventDateStr = eventDateValue.toISOString().split('T')[0];
      } else {
        // Fallback: convert to string and handle
        eventDateStr = String(eventDateValue).split('T')[0];
      }
      
      // Parse the date components to create a proper local date
      const [year, month, day] = eventDateStr.split('-').map(Number);
      const displayDate = new Date(year, month - 1, day);
      const eventDateDisplay = displayDate.toLocaleDateString('es-CO', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      const nowUTC = new Date();
      const colombiaOffset = -5 * 60;
      const nowColombia = new Date(nowUTC.getTime() + (colombiaOffset * 60 * 1000));
      const eventStart = new Date(year, month - 1, day);
      
      if (nowColombia < eventStart) {
        return { 
          isValid: false, 
          error: `This ticket is for a future event (${eventDateDisplay}). Valid only on event date.` 
        };
      } else {
        return { 
          isValid: false, 
          error: `This ticket was for ${eventDateDisplay} and is no longer valid (expired at 1:00 AM next day).` 
        };
      }
    }

    return { isValid: true, purchase };
  } catch (error) {
    return { isValid: false, error: "Invalid QR code" };
  }
} 

export async function validateMenuFromTicketPurchase(
  qrCode: string,
  user: { id: string; role: string; clubId?: string }
): Promise<{
  isValid: boolean;
  purchase?: TicketPurchase;
  error?: string;
}> {
  try {
    const payload = decryptQR(qrCode);

    if (!validateQRType(payload.type, "menu_from_ticket")) {
      return { isValid: false, error: "Invalid QR type for menu from ticket validation" };
    }

    if (!payload.ticketPurchaseId) {
      return { isValid: false, error: "Missing ticket purchase ID in QR code" };
    }

    // Only waiters can validate menu_from_ticket QRs
    if (user.role !== "waiter") {
      return { isValid: false, error: "Only waiters can validate menu QR codes from tickets" };
    }

    const purchaseRepository = AppDataSource.getRepository(TicketPurchase);
    const purchase = await purchaseRepository.findOne({
      where: { id: payload.ticketPurchaseId },
      relations: ["ticket", "club"]
    });

    if (!purchase) {
      return { isValid: false, error: "Ticket purchase not found" };
    }

    const hasAccess = await validateClubAccess(user, purchase.clubId);
    if (!hasAccess) {
      return { isValid: false, error: "Access denied to this club" };
    }

    // Check if menu QR has already been used
    if (purchase.isUsedMenu) {
      return { isValid: false, error: "Menu QR already used" };
    }

    // Check if ticket date is valid (same logic as ticket validation)
    if (!checkTicketDateIsValid(purchase.date)) {
      const eventDateValue = purchase.date as any;
      let eventDateStr: string;
      
      if (typeof eventDateValue === 'string') {
        eventDateStr = eventDateValue.includes('T') ? eventDateValue.split('T')[0] : eventDateValue;
      } else if (eventDateValue instanceof Date) {
        eventDateStr = eventDateValue.toISOString().split('T')[0];
      } else {
        eventDateStr = String(eventDateValue).split('T')[0];
      }
      
      const [year, month, day] = eventDateStr.split('-').map(Number);
      const displayDate = new Date(year, month - 1, day);
      const eventDateDisplay = displayDate.toLocaleDateString('es-CO', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      const nowUTC = new Date();
      const colombiaOffset = -5 * 60;
      const nowColombia = new Date(nowUTC.getTime() + (colombiaOffset * 60 * 1000));
      const eventStart = new Date(year, month - 1, day);
      
      if (nowColombia < eventStart) {
        return { 
          isValid: false, 
          error: `This menu QR is for a future event (${eventDateDisplay}). Valid only on event date.` 
        };
      } else {
        return { 
          isValid: false, 
          error: `This menu QR was for ${eventDateDisplay} and is no longer valid (expired at 1:00 AM next day).` 
        };
      }
    }

    return { isValid: true, purchase };
  } catch (error) {
    return { isValid: false, error: "Invalid QR code" };
  }
} 