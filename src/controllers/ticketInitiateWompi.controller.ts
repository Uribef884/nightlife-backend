import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { CartItem } from "../entities/TicketCartItem";
import { calculatePlatformFee, calculateGatewayFees } from "../utils/ticketfeeUtils";
import { isDisposableEmail } from "../utils/disposableEmailValidator";
import { differenceInMinutes } from "date-fns";
import { AuthenticatedRequest } from "../types/express";
import { computeDynamicPrice, computeDynamicEventPrice, getNormalTicketDynamicPricingReason, getEventTicketDynamicPricingReason } from "../utils/dynamicPricing";
import { getTicketCommissionRate } from "../config/fees";
import { sanitizeInput } from "../utils/sanitizeInput";
import { wompiService } from "../services/wompi.service";
import { WOMPI_CONFIG } from "../config/wompi";
import { generateTransactionSignature } from "../utils/generateWompiSignature";

// In-memory store for temporary transaction data (in production, use Redis)
const transactionStore = new Map<string, {
  userId: string | null;
  sessionId: string | null;
  email: string;
  cartItems: any[];
  totalAmount: number;
  acceptanceTokens: any;
  paymentSourceId?: string;
  expiresAt: number;
}>();

export const initiateWompiTicketCheckout = async (req: Request, res: Response) => {
  const typedReq = req as AuthenticatedRequest;
  const userId = typedReq.user?.id ?? null;
  const sessionId: string | null = !userId && typedReq.sessionId ? typedReq.sessionId : null;
  
  // Sanitize email input
  const rawEmail = typedReq.user?.email ?? typedReq.body?.email;
  const sanitizedEmail = sanitizeInput(rawEmail);
  
  if (!sanitizedEmail) {
    return res.status(400).json({ error: "Valid email is required to complete checkout." });
  }
  
  const email = sanitizedEmail;

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

  // 🎯 Business rule: All items must be for the same date and club
  const firstItem = cartItems[0];
  const expectedClubId = firstItem.ticket.clubId;
  const expectedDate = firstItem.date;
  
  const invalidItems = cartItems.filter(item => 
    item.ticket.clubId !== expectedClubId || 
    item.date !== expectedDate
  );
  
  if (invalidItems.length > 0) {
    return res.status(400).json({ 
      error: "All items in cart must be for the same date and club" 
    });
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
    return res.status(400).json({ error: "Free checkouts should use the regular checkout endpoint" });
  }

  // Get payment method from request
  const { paymentMethod, paymentData } = req.body;
  
  if (!paymentMethod) {
    return res.status(400).json({ error: "Payment method is required" });
  }

  // Calculate totals (same logic as existing initiate controller)
  let total = 0;
  let totalWithPlatformFees = 0;
  
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
    } else if (ticket.category === "event") {
      // Grace period check for event tickets when dynamic pricing is disabled
      if (ticket.event) {
        const gracePeriodCheck = computeDynamicEventPrice(Number(ticket.price), new Date(ticket.event.availableDate), ticket.event.openHours);
        if (gracePeriodCheck === -1) {
          return res.status(400).json({ 
            error: `Event "${ticket.name}" has already started and is no longer available for purchase.` 
          });
        } else if (gracePeriodCheck > basePrice) {
          // If grace period price is higher than base price, use grace period price
          dynamicPrice = gracePeriodCheck;
        }
      } else if (ticket.availableDate) {
        const eventDate = new Date(ticket.availableDate);
        const gracePeriodCheck = computeDynamicEventPrice(basePrice, eventDate);
        if (gracePeriodCheck === -1) {
          return res.status(400).json({ 
            error: `Event "${ticket.name}" has already started and is no longer available for purchase.` 
          });
        } else if (gracePeriodCheck > basePrice) {
          // If grace period price is higher than base price, use grace period price
          dynamicPrice = gracePeriodCheck;
        }
      }
    }
    
    // Calculate platform fees per ticket
    const platformFee = calculatePlatformFee(dynamicPrice, getTicketCommissionRate(ticket.category === "event"));
    const itemTotalWithPlatformFee = dynamicPrice + platformFee;
    
    // Add to totals
    total += dynamicPrice * item.quantity;
    totalWithPlatformFees += itemTotalWithPlatformFee * item.quantity;
  }

  // Calculate gateway fees on the total amount
  const { totalGatewayFee, iva } = calculateGatewayFees(totalWithPlatformFees);
  const finalTotal = totalWithPlatformFees + totalGatewayFee + iva;

  try {
    // Step 1: Get acceptance tokens
    const acceptanceTokens = await wompiService().getAcceptanceTokens();

    // Step 2: Tokenize payment method based on type
    let tokenResponse;
    let paymentSourceResponse;

    switch (paymentMethod) {
      case WOMPI_CONFIG.PAYMENT_METHODS.CARD:
        console.log("[WOMPI-TICKET-INITIATE] Tokenizing card...");
        tokenResponse = await wompiService().tokenizeCard(paymentData);
        break;

      case WOMPI_CONFIG.PAYMENT_METHODS.NEQUI:
        console.log("[WOMPI-TICKET-INITIATE] Tokenizing Nequi...");
        tokenResponse = await wompiService().tokenizeNequi(paymentData);
        // Poll for approval
        tokenResponse = await wompiService().pollTokenStatus('nequi', tokenResponse.data.id);
        break;

      case WOMPI_CONFIG.PAYMENT_METHODS.DAVIPLATA:
        console.log("[WOMPI-TICKET-INITIATE] Tokenizing Daviplata...");
        tokenResponse = await wompiService().tokenizeDaviplata(paymentData);
        
        // Send OTP if provided
        if (paymentData.otpUrl && paymentData.bearerToken) {
          await wompiService().sendOtp(paymentData.otpUrl, paymentData.bearerToken);
        }
        
        // Poll for approval
        tokenResponse = await wompiService().pollTokenStatus('daviplata', tokenResponse.data.id);
        break;

      case WOMPI_CONFIG.PAYMENT_METHODS.BANCOLOMBIA_TRANSFER:
        console.log("[WOMPI-TICKET-INITIATE] Tokenizing Bancolombia Transfer...");
        tokenResponse = await wompiService().tokenizeBancolombiaTransfer(paymentData);
        // Poll for approval
        tokenResponse = await wompiService().pollTokenStatus('bancolombia_transfer', tokenResponse.data.id);
        break;

      case WOMPI_CONFIG.PAYMENT_METHODS.PSE:
        // PSE doesn't require tokenization, proceed directly to transaction
        break;

      default:
        return res.status(400).json({ error: "Unsupported payment method" });
    }

    // Step 3: Create payment source (except for PSE)
    if (paymentMethod !== WOMPI_CONFIG.PAYMENT_METHODS.PSE && tokenResponse) {
      console.log("[WOMPI-TICKET-INITIATE] Creating payment source...");
      paymentSourceResponse = await wompiService().createPaymentSource({
        type: paymentMethod,
        token: tokenResponse.data.id,
        customer_email: email,
        acceptance_token: acceptanceTokens.data.presigned_acceptance.acceptance_token,
        accept_personal_auth: acceptanceTokens.data.presigned_personal_data_auth.acceptance_token,
      });
    }

    // Step 4: Create transaction
    console.log("[WOMPI-TICKET-INITIATE] Creating transaction...");
    let transactionPayload: any = {
      amount_in_cents: Math.round(finalTotal * 100), // Convert to cents
      currency: "COP",
      reference: `ticket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      customer_email: email,
      acceptance_token: acceptanceTokens.data.presigned_acceptance.acceptance_token,
      accept_personal_auth: acceptanceTokens.data.presigned_personal_data_auth.acceptance_token,
    };

    // Add payment method specific data
    if (paymentMethod === WOMPI_CONFIG.PAYMENT_METHODS.CARD) {
      transactionPayload.payment_method = {
        type: "CARD",
        installments: paymentData.installments || 1,
      };
      if (paymentSourceResponse) {
        transactionPayload.payment_source_id = paymentSourceResponse.data.id;
      }
    } else if (paymentMethod === WOMPI_CONFIG.PAYMENT_METHODS.NEQUI) {
      transactionPayload.payment_method = {
        type: "NEQUI",
        phone_number: paymentData.phone_number,
      };
      if (paymentSourceResponse) {
        transactionPayload.payment_source_id = paymentSourceResponse.data.id;
      }
    } else if (paymentMethod === WOMPI_CONFIG.PAYMENT_METHODS.DAVIPLATA) {
      transactionPayload.payment_method = {
        type: "DAVIPLATA",
        phone_number: paymentData.phone_number,
      };
      if (paymentSourceResponse) {
        transactionPayload.payment_source_id = paymentSourceResponse.data.id;
      }
    } else if (paymentMethod === WOMPI_CONFIG.PAYMENT_METHODS.BANCOLOMBIA_TRANSFER) {
      transactionPayload.payment_method = {
        type: "BANCOLOMBIA_TRANSFER",
        phone_number: paymentData.phone_number,
      };
      if (paymentSourceResponse) {
        transactionPayload.payment_source_id = paymentSourceResponse.data.id;
      }
    } else if (paymentMethod === WOMPI_CONFIG.PAYMENT_METHODS.PSE) {
      transactionPayload.payment_method = {
        type: "PSE",
        user_type: paymentData.user_type,
        user_legal_id_type: paymentData.user_legal_id_type,
        user_legal_id: paymentData.user_legal_id,
        financial_institution_code: paymentData.financial_institution_code,
        payment_description: paymentData.payment_description,
      };
    }
    

  // ✅ Move this AFTER `transactionPayload.payment_method` is fully defined
  const signatureInput = {
    amount_in_cents: transactionPayload.amount_in_cents,
    currency: transactionPayload.currency,
    customer_email: transactionPayload.customer_email,
    reference: transactionPayload.reference,
    payment_method_type: transactionPayload.payment_method?.type,
  };

  console.log("🔐 Raw signature input:", signatureInput);

  transactionPayload.signature = generateTransactionSignature(signatureInput);
    


    const transactionResponse = await wompiService().createTransaction(transactionPayload);

    // Store transaction data for confirmation
    const transactionId = transactionResponse.data.id;
    transactionStore.set(transactionId, {
      userId,
      sessionId,
      email,
      cartItems: cartItems.map(item => ({
        ticketId: item.ticketId,
        quantity: item.quantity,
        date: item.date,
      })),
      totalAmount: finalTotal,
      acceptanceTokens: acceptanceTokens.data,
      paymentSourceId: paymentSourceResponse?.data.id,
      expiresAt: Date.now() + (30 * 60 * 1000), // 30 minutes
    });

    // Return response based on payment method
    const response: any = {
      success: true,
      transactionId,
      total: finalTotal,
      message: "Ticket checkout initiated successfully",
    };

    // Add redirect URL for methods that require it
    if (transactionResponse.data.async_payment_url) {
      response.redirectUrl = transactionResponse.data.async_payment_url;
    } else if (transactionResponse.data.redirect_url) {
      response.redirectUrl = transactionResponse.data.redirect_url;
    }

    // For card transactions, check if approved immediately
    if (paymentMethod === WOMPI_CONFIG.PAYMENT_METHODS.CARD) {
      if (transactionResponse.data.status === WOMPI_CONFIG.STATUSES.APPROVED) {
        response.status = "APPROVED";
      } else if (transactionResponse.data.status === WOMPI_CONFIG.STATUSES.DECLINED) {
        response.status = "DECLINED";
        response.error = "Payment was declined";
      }
    }

    console.log(`[WOMPI-TICKET-INITIATE] Transaction created: ${transactionId}`);
    return res.json(response);

  } catch (error: any) {
    console.error("[WOMPI-TICKET-INITIATE] Error:", error);
    return res.status(400).json({ 
      error: error.message || "Failed to initiate Wompi checkout" 
    });
  }
};

// Helper function to get stored transaction data
export const getStoredTransactionData = (transactionId: string) => {
  const data = transactionStore.get(transactionId);
  if (!data) return null;
  
  // Check if expired
  if (Date.now() > data.expiresAt) {
    transactionStore.delete(transactionId);
    return null;
  }
  
  return data;
};

// Helper function to remove stored transaction data
export const removeStoredTransactionData = (transactionId: string) => {
  transactionStore.delete(transactionId);
}; 