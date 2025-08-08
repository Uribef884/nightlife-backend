import { Request, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { MenuCartItem } from "../entities/MenuCartItem";
import { isDisposableEmail } from "../utils/disposableEmailValidator";
import { differenceInMinutes } from "date-fns";
import { AuthenticatedRequest } from "../types/express";
import { computeDynamicPrice } from "../utils/dynamicPricing";
import { sanitizeInput } from "../utils/sanitizeInput";
import { calculatePlatformFee, calculateGatewayFees } from "../utils/menuFeeUtils";
import { getMenuCommissionRate } from "../config/fees";
import { wompiService } from "../services/wompi.service";
import { WOMPI_CONFIG } from "../config/wompi";

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

export const initiateWompiMenuCheckout = async (req: Request, res: Response) => {
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

  const cartRepo = AppDataSource.getRepository(MenuCartItem);
  const where = userId !== null ? { userId } : sessionId !== null ? { sessionId } : undefined;

  if (!where) {
    return res.status(400).json({ error: "Missing session or user" });
  }

  const cartItems = await cartRepo.find({
    where,
    relations: ["menuItem", "variant", "menuItem.club"],
  });

  if (!cartItems.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  // 🎯 Business rule: All items must be from the same club
  const firstItem = cartItems[0];
  const expectedClubId = firstItem.menuItem.clubId;
  
  const invalidItems = cartItems.filter(item => 
    item.menuItem.clubId !== expectedClubId
  );
  
  if (invalidItems.length > 0) {
    return res.status(400).json({ 
      error: "All items in cart must be from the same club" 
    });
  }

  // 🍒 TTL expiration check
  const oldestItem = cartItems.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
  const minutesOld = differenceInMinutes(new Date(), new Date(oldestItem.createdAt));
  if (minutesOld > 30) {
    await cartRepo.delete(where);
    return res.status(400).json({ error: "Cart expired. Please start over." });
  }

  const invalidItem = cartItems.find((item) => !item.menuItem.isActive);
  if (invalidItem) {
    return res.status(400).json({
      error: `The menu item "${invalidItem.menuItem.name}" is no longer available for purchase.`,
    });
  }

  // Get payment method from request
  const { paymentMethod, paymentData } = req.body;
  
  if (!paymentMethod) {
    return res.status(400).json({ error: "Payment method is required" });
  }

  // Calculate totals (same logic as existing initiate controller)
  let total = 0;
  let totalPaid = 0;
  let totalClubReceives = 0;
  let totalPlatformReceives = 0;

  for (const item of cartItems) {
    const club = item.menuItem.club;
    const hasVariants = item.menuItem.hasVariants;

    let basePrice: number;

    if (hasVariants) {
      const variantPrice = Number(item.variant?.price);
      if (isNaN(variantPrice)) {
        console.error(`[❌] Variant has no valid price — Variant ID: ${item.variant?.id}, MenuItem ID: ${item.menuItem.id}`);
        console.dir(item.variant, { depth: null });
        return res.status(500).json({
          error: `Internal error: Variant for "${item.menuItem.name}" has no valid price.`,
        });
      }
      basePrice = variantPrice;
    } else {
      if (typeof item.menuItem.price !== "number") {
        console.error(`[❌] Menu item has no price — MenuItem ID: ${item.menuItem.id}`);
        return res.status(500).json({
          error: `Internal error: Price missing for item "${item.menuItem.name}"`,
        });
      }
      basePrice = item.menuItem.price;
    }

    // Compute dynamic price based on whether it's enabled
    let dynamicPrice = basePrice;
    
    if (hasVariants && item.variant) {
      // For variants, check variant's dynamic pricing setting
      if (item.variant.dynamicPricingEnabled) {
        dynamicPrice = computeDynamicPrice({
          basePrice,
          clubOpenDays: club.openDays,
          openHours: club.openHours, // Pass the array directly, not a string
        });
      }
    } else {
      // For regular menu items, check menu item's dynamic pricing setting
      if (item.menuItem.dynamicPricingEnabled) {
        dynamicPrice = computeDynamicPrice({
          basePrice,
          clubOpenDays: club.openDays,
          openHours: club.openHours, // Pass the array directly, not a string
        });
      }
    }
    
    // Calculate platform fees per item (matching checkout logic exactly)
    const platformFee = calculatePlatformFee(dynamicPrice, getMenuCommissionRate());
    const quantity = item.quantity;
    
    // Add to transaction totals (matching checkout logic exactly)
    total += dynamicPrice * quantity;
    totalPaid += (dynamicPrice + platformFee) * quantity;
    totalClubReceives += dynamicPrice * quantity;
    totalPlatformReceives += platformFee * quantity;
  }

  // Calculate gateway fees on the total amount (matching checkout logic exactly)
  const { totalGatewayFee, iva } = calculateGatewayFees(totalPaid);
  const finalTotal = totalPaid + totalGatewayFee + iva;

  console.log(`🍽️ [WOMPI-MENU-INITIATE] CALCULATION DEBUG:`);
  console.log(`   Total Paid (before gateway): ${totalPaid}`);
  console.log(`   Total Club Receives: ${totalClubReceives}`);
  console.log(`   Total Platform Receives: ${totalPlatformReceives}`);
  console.log(`   Gateway Fee: ${totalGatewayFee}`);
  console.log(`   Gateway IVA: ${iva}`);
  console.log(`   Final Total: ${finalTotal}`);
  console.log(`   ========================================`);

  try {
    // Step 1: Get acceptance tokens
    console.log("[WOMPI-MENU-INITIATE] Getting acceptance tokens...");
    const acceptanceTokens = await wompiService().getAcceptanceTokens();

    // Step 2: Tokenize payment method based on type
    let tokenResponse;
    let paymentSourceResponse;

    switch (paymentMethod) {
      case WOMPI_CONFIG.PAYMENT_METHODS.CARD:
        console.log("[WOMPI-MENU-INITIATE] Tokenizing card...");
        tokenResponse = await wompiService().tokenizeCard(paymentData);
        break;

      case WOMPI_CONFIG.PAYMENT_METHODS.NEQUI:
        console.log("[WOMPI-MENU-INITIATE] Tokenizing Nequi...");
        tokenResponse = await wompiService().tokenizeNequi(paymentData);
        // Poll for approval
        tokenResponse = await wompiService().pollTokenStatus('nequi', tokenResponse.data.id);
        break;

      case WOMPI_CONFIG.PAYMENT_METHODS.DAVIPLATA:
        console.log("[WOMPI-MENU-INITIATE] Tokenizing Daviplata...");
        tokenResponse = await wompiService().tokenizeDaviplata(paymentData);
        
        // Send OTP if provided
        if (paymentData.otpUrl && paymentData.bearerToken) {
          await wompiService().sendOtp(paymentData.otpUrl, paymentData.bearerToken);
        }
        
        // Poll for approval
        tokenResponse = await wompiService().pollTokenStatus('daviplata', tokenResponse.data.id);
        break;

      case WOMPI_CONFIG.PAYMENT_METHODS.BANCOLOMBIA_TRANSFER:
        console.log("[WOMPI-MENU-INITIATE] Tokenizing Bancolombia Transfer...");
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
      console.log("[WOMPI-MENU-INITIATE] Creating payment source...");
      paymentSourceResponse = await wompiService().createPaymentSource({
        type: paymentMethod,
        token: tokenResponse.data.id,
        customer_email: email,
        acceptance_token: acceptanceTokens.data.presigned_acceptance.acceptance_token,
        accept_personal_auth: acceptanceTokens.data.presigned_personal_data_auth.acceptance_token,
      });
    }

    // Step 4: Create transaction
    console.log("[WOMPI-MENU-INITIATE] Creating transaction...");
    const transactionPayload: any = {
      amount_in_cents: Math.round(finalTotal * 100), // Convert to cents
      currency: "COP",
      reference: `menu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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

    const transactionResponse = await wompiService().createTransaction(transactionPayload);

    // Store transaction data for confirmation
    const transactionId = transactionResponse.data.id;
    transactionStore.set(transactionId, {
      userId,
      sessionId,
      email,
      cartItems: cartItems.map(item => ({
        menuItemId: item.menuItemId,
        variantId: item.variantId,
        quantity: item.quantity,
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
      message: "Menu checkout initiated successfully",
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

    console.log(`[WOMPI-MENU-INITIATE] Transaction created: ${transactionId}`);
    return res.json(response);

  } catch (error: any) {
    console.error("[WOMPI-MENU-INITIATE] Error:", error);
    return res.status(400).json({ 
      error: error.message || "Failed to initiate Wompi checkout" 
    });
  }
};

// Helper function to get stored transaction data
export const getStoredMenuTransactionData = (transactionId: string) => {
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
export const removeStoredMenuTransactionData = (transactionId: string) => {
  transactionStore.delete(transactionId);
}; 