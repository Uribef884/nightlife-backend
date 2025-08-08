import { Request, Response } from "express";
import { wompiService } from "../services/wompi.service";
import { WOMPI_CONFIG } from "../config/wompi";
import { getStoredTransactionData, removeStoredTransactionData } from "./ticketInitiateWompi.controller";
import { processSuccessfulCheckout } from "./ticketCheckout.controller";
import { AuthenticatedRequest } from "../types/express";

export const confirmWompiTicketCheckout = async (req: Request, res: Response) => {
  const typedReq = req as AuthenticatedRequest;
  const { transactionId } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: "Transaction ID is required" });
  }

  try {
    console.log(`[WOMPI-TICKET-CHECKOUT] Confirming transaction: ${transactionId}`);

    // Get stored transaction data
    const storedData = getStoredTransactionData(transactionId);
    if (!storedData) {
      return res.status(400).json({ error: "Transaction not found or expired" });
    }

    // Check Wompi transaction status
    const transactionStatus = await wompiService().getTransactionStatus(transactionId);
    
    console.log(`[WOMPI-TICKET-CHECKOUT] Transaction status: ${transactionStatus.data.status}`);

    if (transactionStatus.data.status === WOMPI_CONFIG.STATUSES.APPROVED) {
      // Transaction is approved, proceed with checkout
      console.log(`[WOMPI-TICKET-CHECKOUT] Transaction approved, processing checkout...`);
      
      // Remove stored data to prevent double processing
      removeStoredTransactionData(transactionId);

      // Call the existing processSuccessfulCheckout with the stored data
      return await processSuccessfulCheckout({
        userId: storedData.userId,
        sessionId: storedData.sessionId,
        email: storedData.email,
        req,
        res,
        transactionId,
      });

    } else if (transactionStatus.data.status === WOMPI_CONFIG.STATUSES.DECLINED) {
      console.log(`[WOMPI-TICKET-CHECKOUT] Transaction declined: ${transactionId}`);
      removeStoredTransactionData(transactionId);
      return res.status(400).json({ 
        error: "Payment was declined",
        status: "DECLINED"
      });

    } else if (transactionStatus.data.status === WOMPI_CONFIG.STATUSES.ERROR) {
      console.log(`[WOMPI-TICKET-CHECKOUT] Transaction error: ${transactionId}`);
      removeStoredTransactionData(transactionId);
      return res.status(400).json({ 
        error: "Payment processing error",
        status: "ERROR"
      });

    } else if (transactionStatus.data.status === WOMPI_CONFIG.STATUSES.PENDING) {
      // For pending transactions, poll until resolved
      console.log(`[WOMPI-TICKET-CHECKOUT] Transaction pending, polling for status...`);
      
      try {
        const finalStatus = await wompiService().pollTransactionStatus(transactionId);
        
        if (finalStatus.data.status === WOMPI_CONFIG.STATUSES.APPROVED) {
          // Remove stored data to prevent double processing
          removeStoredTransactionData(transactionId);

          // Call the existing processSuccessfulCheckout with the stored data
          return await processSuccessfulCheckout({
            userId: storedData.userId,
            sessionId: storedData.sessionId,
            email: storedData.email,
            req,
            res,
            transactionId,
          });
        } else {
          removeStoredTransactionData(transactionId);
          return res.status(400).json({ 
            error: `Payment was ${finalStatus.data.status.toLowerCase()}`,
            status: finalStatus.data.status
          });
        }
      } catch (pollError: any) {
        console.error(`[WOMPI-TICKET-CHECKOUT] Polling error:`, pollError);
        return res.status(400).json({ 
          error: pollError.message || "Payment polling failed",
          status: "TIMEOUT"
        });
      }
    }

  } catch (error: any) {
    console.error(`[WOMPI-TICKET-CHECKOUT] Error:`, error);
    return res.status(500).json({ 
      error: error.message || "Failed to confirm Wompi checkout" 
    });
  }
};

// Helper endpoint to check transaction status without processing
export const checkWompiTransactionStatus = async (req: Request, res: Response) => {
  const { transactionId } = req.params;

  if (!transactionId) {
    return res.status(400).json({ error: "Transaction ID is required" });
  }

  try {
    const transactionStatus = await wompiService().getTransactionStatus(transactionId);
    
    return res.json({
      transactionId,
      status: transactionStatus.data.status,
      amount: transactionStatus.data.amount_in_cents / 100,
      currency: transactionStatus.data.currency,
      reference: transactionStatus.data.reference,
      customerEmail: transactionStatus.data.customer_email,
      createdAt: transactionStatus.data.created_at,
      finalizedAt: transactionStatus.data.finalized_at,
    });

  } catch (error: any) {
    console.error(`[WOMPI-TICKET-STATUS] Error:`, error);
    return res.status(500).json({ 
      error: error.message || "Failed to check transaction status" 
    });
  }
}; 