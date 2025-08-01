import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/TicketCartItem";
import { Ticket } from "../entities/Ticket";
import { TicketPurchase } from "../entities/TicketPurchase";
import { PurchaseTransaction } from "../entities/TicketPurchaseTransaction";
import { TicketIncludedMenuItem } from "../entities/TicketIncludedMenuItem";
import { MenuItemFromTicket } from "../entities/MenuItemFromTicket";
import { MenuItem } from "../entities/MenuItem";
import { MenuItemVariant } from "../entities/MenuItemVariant";
import { calculatePlatformFee, calculateGatewayFees } from "../utils/ticketfeeUtils";
import { isDisposableEmail } from "../utils/disposableEmailValidator";
import { generateEncryptedQR } from "../utils/generateEncryptedQR";
import { sendTicketEmail, sendMenuFromTicketEmail } from "../services/emailService";
import { differenceInMinutes } from "date-fns";
import { mockValidateWompiTransaction } from "../services/mockWompiService";
import { User } from "../entities/User";
import { AuthenticatedRequest } from "../types/express"; 
import QRCode from "qrcode";
import { computeDynamicPrice, computeDynamicEventPrice, getNormalTicketDynamicPricingReason, getEventTicketDynamicPricingReason } from "../utils/dynamicPricing";
import { getTicketCommissionRate } from "../config/fees";
import { sanitizeInput } from "../utils/sanitizeInput";

export const processSuccessfulCheckout = async ({
  userId,
  sessionId,
  email,
  req,
  res,
  transactionId,
}: {
  userId: string | null;
  sessionId: string | null;
  email: string;
  req: Request;
  res: Response;
  transactionId?: string;
}): Promise<Response> => {
  const cartRepo = AppDataSource.getRepository(CartItem);
  const ticketRepo = AppDataSource.getRepository(Ticket);
  const purchaseRepo = AppDataSource.getRepository(TicketPurchase);
  const transactionRepo = AppDataSource.getRepository(PurchaseTransaction);
  const userRepo = AppDataSource.getRepository(User);

  const where = userId !== null ? { userId } : sessionId !== null ? { sessionId } : undefined;
  if (!where) return res.status(400).json({ error: "Missing session or user" });

  const cartItems = await cartRepo.find({
    where,
    relations: ["ticket", "ticket.club", "ticket.event"],
  });

  if (!cartItems.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const oldest = cartItems.reduce((a, b) => a.createdAt < b.createdAt ? a : b);
  const age = differenceInMinutes(new Date(), new Date(oldest.createdAt));
  if (age > 30) {
    await cartRepo.delete(where);
    return res.status(400).json({ error: "Cart expired. Please start over." });
  }

  for (const item of cartItems) {
    if (!item.ticket.isActive) {
      return res.status(400).json({
        error: `The ticket "${item.ticket.name}" is no longer available for purchase.`,
      });
    }
  }

  const isFreeCheckout = cartItems.every(item => Number(item.ticket.price) === 0);
  if (isFreeCheckout && transactionId) {
    return res.status(400).json({ error: "Free checkouts should not include a payment transaction" });
  }
  if (!isFreeCheckout && !transactionId) {
    return res.status(400).json({ error: "Missing transaction ID for paid checkout" });
  }

  const clubId = cartItems[0].ticket.clubId;
  
  // 🎯 Improved date validation with timezone handling
  let cartDate: Date;
  if (cartItems[0].date instanceof Date) {
    cartDate = cartItems[0].date;
  } else {
    // If it's a string, parse it properly
    const dateStr = String(cartItems[0].date);
    const [year, month, day] = dateStr.split("-").map(Number);
    cartDate = new Date(year, month - 1, day);
  }
  
  // Get today's date in the same timezone (start of day)
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  // Compare dates properly
  if (cartDate < todayStart) {
    console.log(`[DEBUG] Date validation failed: cartDate=${cartDate.toISOString()}, todayStart=${todayStart.toISOString()}`);
    return res.status(400).json({ error: "Cannot select a past date" });
  }
  
  const date = cartDate;
  
  // Format date string for email templates
  const dateStr = date.toISOString().split("T")[0];

  // Different commission rates based on ticket type
  const getPlatformFeePercentage = (ticket: any) => {
    return getTicketCommissionRate(ticket.category === "event");
  };
  let retentionICA: number | undefined;
  let retentionIVA: number | undefined;
  let retentionFuente: number | undefined;

  let totalPaid = 0;
  let totalClubReceives = 0;
  let totalPlatformReceives = 0;
  let totalGatewayFee = 0;
  let totalGatewayIVA = 0;

  const ticketPurchases: TicketPurchase[] = [];
  const user = userId ? await userRepo.findOneBy({ id: userId }) : undefined;

  // First, update ticket quantities
  for (const item of cartItems) {
    const ticket = item.ticket;
    const quantity = item.quantity;

    if (ticket.quantity != null) {
      const updatedTicket = await ticketRepo.findOneByOrFail({ id: ticket.id });
      if ((updatedTicket.quantity ?? 0) < quantity) {
        return res.status(400).json({ error: `Not enough tickets left for ${ticket.name}` });
      }
      updatedTicket.quantity = (updatedTicket.quantity ?? 0) - quantity;
      await ticketRepo.save(updatedTicket);
    }
  }

  // 🎯 Calculate ticket totals first (before gateway fees)
  for (const item of cartItems) {
    const ticket = item.ticket;
    const quantity = item.quantity;

    for (let i = 0; i < quantity; i++) {
      const basePrice = Number(ticket.price);
      
      // 🎯 Apply dynamic pricing if enabled
      let dynamicPrice = basePrice;
      let dynamicPricingReason: string | undefined;
      
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
          
          // Determine reason using the new function
          dynamicPricingReason = getEventTicketDynamicPricingReason(new Date(ticket.event.availableDate), ticket.event.openHours);
        } else if (ticket.category === "event" && ticket.availableDate) {
          // Fallback: Event ticket without event relation - use ticket's availableDate
          const eventDate = new Date(ticket.availableDate);
          dynamicPrice = computeDynamicEventPrice(basePrice, eventDate);
          
          // Determine reason using the new function
          dynamicPricingReason = getEventTicketDynamicPricingReason(eventDate);
        } else {
          // General ticket - use time-based dynamic pricing
          dynamicPrice = computeDynamicPrice({
            basePrice,
            clubOpenDays: ticket.club.openDays,
            openHours: ticket.club.openHours, // Pass the array directly, not a string
          });
          
          // Determine reason using the new function
          dynamicPricingReason = getNormalTicketDynamicPricingReason({
            basePrice,
            clubOpenDays: ticket.club.openDays,
            openHours: ticket.club.openHours,
          });
        }
      }
      
      // 🎯 Calculate individual ticket fees (only platform fee)
      const platformFee = isFreeCheckout ? 0 : calculatePlatformFee(dynamicPrice, getPlatformFeePercentage(ticket));
      
      const clubReceives = dynamicPrice;

      console.log(`🎫 [TICKET-CHECKOUT] Item: ${ticket.name} (${i + 1}/${quantity})`);
      console.log(`   Base Price: ${basePrice}`);
      console.log(`   Dynamic Price: ${dynamicPrice}`);
      console.log(`   Platform Fee Rate: ${getPlatformFeePercentage(ticket) * 100}%`);
      console.log(`   Platform Fee: ${platformFee} (${dynamicPrice} × ${getPlatformFeePercentage(ticket)})`);
      console.log(`   Item Total + Platform Fee: ${dynamicPrice + platformFee}`);
      console.log(`   ---`);

      // Add to transaction totals
      totalPaid += dynamicPrice + platformFee;
      totalClubReceives += clubReceives;
      totalPlatformReceives += platformFee;
    }
  }

  // 🎯 Calculate transaction-level gateway fees based on the actual totalPaid
  const { totalGatewayFee: transactionGatewayFee, iva: transactionIVA } = isFreeCheckout
    ? { totalGatewayFee: 0, iva: 0 }
    : calculateGatewayFees(totalPaid);

  console.log(`🎫 [TICKET-CHECKOUT] TRANSACTION TOTALS:`);
  console.log(`   Total Paid (before gateway): ${totalPaid}`);
  console.log(`   Total Club Receives: ${totalClubReceives}`);
  console.log(`   Total Platform Receives: ${totalPlatformReceives}`);
  console.log(`   Gateway Fee: ${transactionGatewayFee}`);
  console.log(`   Gateway IVA: ${transactionIVA}`);
  console.log(`   Final Total: ${totalPaid + transactionGatewayFee + transactionIVA}`);
  console.log(`   ========================================`);

  // Create and save the purchase transaction first
  const purchaseTransaction = transactionRepo.create({
    userId: userId || undefined,
    clubId,
    email,
    date,
    totalPaid: totalPaid + transactionGatewayFee + transactionIVA, // Add gateway fees to total
    clubReceives: totalClubReceives,
    platformReceives: totalPlatformReceives,
    gatewayFee: transactionGatewayFee,
    gatewayIVA: transactionIVA,
    retentionICA,
    retentionIVA,
    retentionFuente,
    paymentProviderTransactionId: transactionId,
    paymentProvider: isFreeCheckout ? "free" : "mock",
    paymentStatus: "APPROVED",
  });

  await transactionRepo.save(purchaseTransaction);

  // Now create the individual ticket purchases and associate them with the transaction
  const ticketIncludedMenuItemRepo = AppDataSource.getRepository(TicketIncludedMenuItem);
  const menuItemFromTicketRepo = AppDataSource.getRepository(MenuItemFromTicket);
  const menuItemRepo = AppDataSource.getRepository(MenuItem);
  const menuItemVariantRepo = AppDataSource.getRepository(MenuItemVariant);

  // Reset totals for individual ticket creation
  let individualTotalPaid = 0;
  let individualTotalClubReceives = 0;
  let individualTotalPlatformReceives = 0;

  for (const item of cartItems) {
    const ticket = item.ticket;
    const quantity = item.quantity;

    for (let i = 0; i < quantity; i++) {
      const basePrice = Number(ticket.price);
      
      // 🎯 Apply dynamic pricing if enabled
      let dynamicPrice = basePrice;
      let dynamicPricingReason: string | undefined;
      
      if (ticket.dynamicPricingEnabled) {
        if (ticket.category === "event" && ticket.event) {
          // Event ticket - use event's date and openHours for dynamic pricing
          // Use the exact same logic as the frontend (ticket controller)
          dynamicPrice = computeDynamicEventPrice(Number(ticket.price), new Date(ticket.event.availableDate), ticket.event.openHours);
          
          // Check if event has passed grace period
          if (dynamicPrice === -1) {
            return res.status(400).json({ 
              error: `Event "${ticket.name}" has already started and is no longer available for purchase.` 
            });
          }
          
          // Determine reason using the new function
          dynamicPricingReason = getEventTicketDynamicPricingReason(new Date(ticket.event.availableDate), ticket.event.openHours);
        } else if (ticket.category === "event" && ticket.availableDate) {
          // Fallback: Event ticket without event relation - use ticket's availableDate
          const eventDate = new Date(ticket.availableDate);
          dynamicPrice = computeDynamicEventPrice(basePrice, eventDate);
          
          // Check if event has passed grace period
          if (dynamicPrice === -1) {
            return res.status(400).json({ 
              error: `Event "${ticket.name}" has already started and is no longer available for purchase.` 
            });
          }
          
          // Determine reason using the new function
          dynamicPricingReason = getEventTicketDynamicPricingReason(eventDate);
        } else {
          // General ticket - use time-based dynamic pricing
          dynamicPrice = computeDynamicPrice({
            basePrice,
            clubOpenDays: ticket.club.openDays,
            openHours: ticket.club.openHours, // Pass the array directly, not a string
          });
          
          // Determine reason using the new function
          dynamicPricingReason = getNormalTicketDynamicPricingReason({
            basePrice,
            clubOpenDays: ticket.club.openDays,
            openHours: ticket.club.openHours,
          });
        }
      }
      
      // 🎯 Calculate individual ticket fees (only platform fee)
      const platformFee = isFreeCheckout ? 0 : calculatePlatformFee(dynamicPrice, getPlatformFeePercentage(ticket));
      
      const clubReceives = dynamicPrice;



      // Add to individual totals for this ticket
      individualTotalPaid += dynamicPrice + platformFee;
      individualTotalClubReceives += clubReceives;
      individualTotalPlatformReceives += platformFee;

      const purchase = purchaseRepo.create({
        ticketId: ticket.id,
        userId,
        sessionId,
        clubId,
        email,
        date,
        // 🎯 Individual ticket pricing information
        originalBasePrice: basePrice,
        priceAtCheckout: dynamicPrice,
        dynamicPricingWasApplied: dynamicPrice !== basePrice,
        dynamicPricingReason,
        clubReceives: dynamicPrice, // What the club gets for this specific ticket
        // 🎯 Individual ticket fees
        platformFee: platformFee,
        platformFeeApplied: getPlatformFeePercentage(ticket),
        purchaseTransactionId: purchaseTransaction.id,
      });

      // Save purchase first to get the ID
      await purchaseRepo.save(purchase);

      // Now generate QR with the actual TicketPurchase.id
      const payload = {
        id: purchase.id,
        clubId,
        type: "ticket" as const
      };

      const encryptedPayload = await generateEncryptedQR(payload);
      const qrDataUrl = await QRCode.toDataURL(encryptedPayload);

      // Update the purchase with the QR code
      purchase.qrCodeEncrypted = encryptedPayload;
      await purchaseRepo.save(purchase);

      ticketPurchases.push(purchase);

      try {
        await sendTicketEmail({
          to: email,
          ticketName: ticket.name,
          date: dateStr,
          qrImageDataUrl: qrDataUrl,
          clubName: ticket.club?.name || "Your Club",
          index: i,
          total: quantity,
        });
      } catch (err) {
        console.error(`[EMAIL ❌] Ticket ${i + 1} failed:`, err);
      }

      // Handle menu items if ticket includes them
      if (ticket.includesMenuItem) {
        try {
          // Get included menu items for this ticket
          const includedMenuItems = await ticketIncludedMenuItemRepo.find({
            where: { ticketId: ticket.id },
            relations: ["menuItem", "variant"]
          });

          if (includedMenuItems.length > 0) {
            // Generate menu QR payload
            const menuPayload = {
              type: "menu_from_ticket" as const,
              ticketPurchaseId: purchase.id,
              clubId,
              items: includedMenuItems.map(item => ({
                menuItemId: item.menuItemId,
                variantId: item.variantId || undefined,
                quantity: item.quantity
              }))
            };

            const menuEncryptedPayload = await generateEncryptedQR(menuPayload);
            const menuQrDataUrl = await QRCode.toDataURL(menuEncryptedPayload);

            // Create records for analytics
            const menuItemFromTicketRecords = includedMenuItems.map(item => 
              menuItemFromTicketRepo.create({
                ticketPurchaseId: purchase.id,
                menuItemId: item.menuItemId,
                variantId: item.variantId || undefined,
                quantity: item.quantity
              })
            );

            await menuItemFromTicketRepo.save(menuItemFromTicketRecords);

            // Send menu email
            const menuItems = includedMenuItems.map(item => ({
              name: item.menuItem.name,
              variant: item.variant?.name || null,
              quantity: item.quantity
            }));

            await sendMenuFromTicketEmail({
              to: email,
              email: email,
              ticketName: ticket.name,
              date: dateStr,
              qrImageDataUrl: menuQrDataUrl,
              clubName: ticket.club?.name || "Your Club",
              items: menuItems,
              index: i,
              total: quantity,
            });
          }
        } catch (err) {
          console.error(`[MENU EMAIL ❌] Menu items for ticket ${i + 1} failed:`, err);
        }
      }
    }
  }

  // Associate purchases with the transaction
  for (const purchase of ticketPurchases) {
    purchase.transaction = purchaseTransaction;
  }

  await purchaseRepo.save(ticketPurchases);

  if (userId) {
    await cartRepo.delete({ userId });
  } else if (sessionId) {
    await cartRepo.delete({ sessionId });
  }

  // For free checkouts, don't return a transactionId since there's no payment gateway involved
  if (isFreeCheckout) {
    return res.json({
      message: "Free checkout completed successfully",
      totalPaid: purchaseTransaction.totalPaid,
      tickets: ticketPurchases.map((p) => ({
        id: p.id,
        priceAtCheckout: p.priceAtCheckout,
      })),
    });
  } else {
    return res.json({
      message: "Checkout completed",
      transactionId: purchaseTransaction.id,
      totalPaid: purchaseTransaction.totalPaid,
      tickets: ticketPurchases.map((p) => ({
        id: p.id,
        priceAtCheckout: p.priceAtCheckout,
      })),
    });
  }
};

export const checkout = async (req: Request, res: Response) => {
  const typedReq = req as AuthenticatedRequest;
  const userId = typedReq.user?.id ?? null;
  const sessionId = !userId && typedReq.sessionId ? typedReq.sessionId : null;
  
  // Sanitize email input
  const rawEmail = typedReq.user?.email ?? typedReq.body?.email;
  const sanitizedEmail = sanitizeInput(rawEmail);
  
  if (!sanitizedEmail) {
    return res.status(400).json({ error: "Valid email is required for checkout" });
  }
  
  const email = sanitizedEmail;

  if (!req.user && isDisposableEmail(email)) {
    return res.status(403).json({ error: "Disposable email domains are not allowed" });
  }

  return await processSuccessfulCheckout({ userId, sessionId, email, req, res });
};

export const confirmMockCheckout = async (req: Request, res: Response) => {
  const typedReq = req as AuthenticatedRequest;
  const userId = typedReq.user?.id ?? null;
  const sessionId = !userId && typedReq.sessionId ? typedReq.sessionId : null;
  
  // Sanitize email input
  const rawEmail = typedReq.user?.email ?? typedReq.body?.email;
  const sanitizedEmail = sanitizeInput(rawEmail);
  const transactionId = req.body.transactionId;

  console.log(`[CONFIRM] Received transactionId: ${transactionId}`);

  if (!sanitizedEmail || !transactionId) {
    return res.status(400).json({ error: "Missing valid email or transaction ID" });
  }
  
  const email = sanitizedEmail;

  const wompiResponse = await mockValidateWompiTransaction(transactionId);
  console.log(`[CONFIRM] Mock validation result:`, wompiResponse);
  
  if (!wompiResponse.approved) {
    return res.status(400).json({ error: "Mock transaction not approved" });
  }

  return await processSuccessfulCheckout({
    userId,
    sessionId,
    email,
    req,
    res,
    transactionId,
  });
};
