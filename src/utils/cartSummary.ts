import { PLATFORM_FEES, GATEWAY_FEES } from "../config/fees";

interface CartItem {
  itemTotal: number; // Total before fees (already includes quantity * dynamic price)
  isEvent?: boolean; // Only for ticket items
}

type CartType = "ticket" | "menu";

interface CartSummary {
  total: number;
  operationalCosts: number;
  actualTotal: number;
}

/**
 * Calculates global cart totals for tickets or menu items
 * @param items Array of cart items (each must have itemTotal and optionally isEvent)
 * @param type "ticket" | "menu"
 */
export function summarizeCartTotals(items: CartItem[], type: CartType): CartSummary {
  const total = items.reduce((sum, item) => sum + item.itemTotal, 0);

  // Return 0 for all values if total is 0 (empty cart or free tickets)
  if (total === 0) {
    return {
      total: 0,
      operationalCosts: 0,
      actualTotal: 0,
    };
  }

  let feeRate: number;
  if (type === "menu") {
    feeRate = PLATFORM_FEES.MENU.ALL_ITEMS;
  } else {
    // Assume all tickets are of the same type; fallback to REGULAR if missing
    const isEvent = items[0]?.isEvent ?? false;
    feeRate = isEvent ? PLATFORM_FEES.TICKET.EVENT : PLATFORM_FEES.TICKET.REGULAR;
  }

  const nightlifeFee = total * feeRate;
  const gatewayFee = (total + nightlifeFee) * GATEWAY_FEES.VARIABLE + GATEWAY_FEES.FIXED;
  const gatewayIVA = gatewayFee * GATEWAY_FEES.IVA;

  const operationalCosts = nightlifeFee + gatewayFee + gatewayIVA;
  const actualTotal = total + operationalCosts;

  return {
    total,
    operationalCosts,
    actualTotal,
  };
}