import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/TicketCartItem";
import { calculatePlatformFee, calculateGatewayFees } from "../utils/ticketfeeUtils";
import { isDisposableEmail } from "../utils/disposableEmailValidator";
import { processSuccessfulCheckout } from "./ticketCheckout.controller";
import { issueMockTransaction, mockValidateWompiTransaction } from "../services/mockWompiService";
import { differenceInMinutes } from "date-fns"; // 🆕 For TTL logic
import { AuthenticatedRequest } from "../types/express";
import { computeDynamicPrice, computeDynamicEventPrice, getNormalTicketDynamicPricingReason, getEventTicketDynamicPricingReason } from "../utils/dynamicPricing";
import { getTicketCommissionRate } from "../config/fees";

export const initiateMockCheckout = async (req: Request, res: Response) => {
  const typedReq = req as AuthenticatedRequest;
  const userId = typedReq.user?.id ?? null;
  const sessionId: string | null = !userId && typedReq.sessionId ? typedReq.sessionId : null;
  const email = typedReq.user?.email ?? typedReq.body?.email;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required to complete checkout." });
  }

  if (!req.user && isDisposableEmail(email)) {
    return res.status(403).json({ error: "Disposable email domains are not allowed." });
  }

  const cartRepo = AppDataSource.getRepository(CartItem);
  const where = userId !== null ? { userId } : sessionId !== null ? { sessionId } : undefined;

  if (!where) {
    return res.status(400).json({ error: "Missing session or user" });
  }

  const cartItems = await cartRepo.find({
    where,
    relations: ["ticket", "ticket.club", "ticket.event"],
  });

  if (!cartItems.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  // 🕒 TTL expiration check
  const oldestItem = cartItems.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
  const minutesOld = differenceInMinutes(new Date(), new Date(oldestItem.createdAt));
  if (minutesOld > 30) {
    await cartRepo.delete(where);
    return res.status(400).json({ error: "Cart expired. Please start over." });
  }

  const invalidTicket = cartItems.find((item) => !item.ticket.isActive);
  if (invalidTicket) {
    return res.status(400).json({
      error: `The ticket "${invalidTicket.ticket.name}" is no longer available for purchase.`,
    });
  }

  const allPricesAreValidNumbers = cartItems.every(
    (item) => !isNaN(Number(item.ticket.price))
  );

  if (!allPricesAreValidNumbers) {
    return res.status(400).json({ error: "Cart contains invalid ticket price types" });
  }

  const isFreeCheckout = cartItems.every((item) => Number(item.ticket.price) === 0);

  if (isFreeCheckout) {
    console.log("[INITIATE] Free checkout. Processing immediately.");
    return await processSuccessfulCheckout({ userId, sessionId, email, req, res });
  }

  let total = 0;
  for (const item of cartItems) {
    const ticket = item.ticket;
    const basePrice = Number(ticket.price);
    
    // Compute dynamic price based on ticket type and settings
    let dynamicPrice = basePrice;
    
          if (ticket.dynamicPricingEnabled) {
        if (ticket.category === "event" && ticket.event) {
          // Event ticket - use event's date and openHours for dynamic pricing
          dynamicPrice = computeDynamicEventPrice(Number(ticket.price), new Date(ticket.event.availableDate), ticket.event.openHours);
          
          // Check if event has passed grace period
          if (dynamicPrice === -1) {
            return res.status(400).json({ 
              error: `Event "${ticket.name}" has already started and is no longer available for purchase.` 
            });
          }
              } else if (ticket.category === "event" && ticket.availableDate) {
          // Fallback: Event ticket without event relation - use ticket's availableDate
          dynamicPrice = computeDynamicEventPrice(basePrice, new Date(ticket.availableDate));
          
          // Check if event has passed grace period
          if (dynamicPrice === -1) {
            return res.status(400).json({ 
              error: `Event "${ticket.name}" has already started and is no longer available for purchase.` 
            });
          }
      } else {
        // General ticket - use time-based dynamic pricing
        dynamicPrice = computeDynamicPrice({
          basePrice,
          clubOpenDays: ticket.club.openDays,
          openHours: Array.isArray(ticket.club.openHours) && ticket.club.openHours.length > 0 ? ticket.club.openHours[0].open + '-' + ticket.club.openHours[0].close : "",
        });
      }
    }
    
    // Calculate fees based on the dynamic price
    const platformFee = calculatePlatformFee(dynamicPrice, getTicketCommissionRate(ticket.category === "event"));
    const { totalGatewayFee, iva } = calculateGatewayFees(dynamicPrice);
    const finalPerUnit = dynamicPrice + platformFee + totalGatewayFee + iva;
    total += finalPerUnit * item.quantity;
  }

  const reference = issueMockTransaction();
  console.log(`[INITIATE] Mock reference ${reference} | User: ${userId ?? sessionId} | Email: ${email}`);

  // Return the mock transaction reference for the frontend to confirm
  const response = {
    success: true,
    transactionId: reference,
    total: total,
    message: "Ticket checkout initiated successfully"
  };
  
  console.log(`[INITIATE] Returning response:`, response);
  return res.json(response);
};
