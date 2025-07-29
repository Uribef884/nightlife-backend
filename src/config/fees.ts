/**
 * Centralized fee configuration
 * 
 * This file contains all fee-related settings for the platform.
 * Update these values to change commission rates, gateway fees, etc.
 */

// Platform Commission Rates
export const PLATFORM_FEES = {
  // Ticket commission rates
  TICKET: {
    REGULAR: 0.05,    // 5% for regular tickets
    EVENT: 0.10,      // 10% for event tickets
  },
  
  // Menu commission rates
  MENU: {
    ALL_ITEMS: 0.025,  // 2.5% for all menu items
  },
} as const;

// Gateway/Payment Provider Fees (Wompi)
export const GATEWAY_FEES = {
  FIXED: 700,         // Fixed fee in COP
  VARIABLE: 0.0265,   // Variable fee 2.65% of the base price
  IVA: 0.19,          // IVA 19% on the subtotal
} as const;

// Dynamic Pricing Rules
export const DYNAMIC_PRICING = {
  // General time-based rules
  CLOSED_DAY: 0.7,    // 30% off if club is closed
  EARLY: 0.9,         // 10% off if >180min before open
  
  // Event-specific rules (hour-based)
  EVENT: {
    HOURS_48_PLUS: 0.7,   // 30% discount for 48+ hours away
    HOURS_24_48: 1.0,     // Base price for 24-48 hours away
    HOURS_LESS_24: 1.2,   // 20% surplus for less than 24 hours
  },
} as const;

// Helper functions to get commission rates
export const getTicketCommissionRate = (isEvent: boolean): number => {
  return isEvent ? PLATFORM_FEES.TICKET.EVENT : PLATFORM_FEES.TICKET.REGULAR;
};

export const getMenuCommissionRate = (): number => {
  return PLATFORM_FEES.MENU.ALL_ITEMS;
};

// Helper function to get dynamic pricing multiplier for events
export const getEventPricingMultiplier = (hoursUntilEvent: number): number => {
  if (hoursUntilEvent >= 48) return DYNAMIC_PRICING.EVENT.HOURS_48_PLUS;
  if (hoursUntilEvent >= 24) return DYNAMIC_PRICING.EVENT.HOURS_24_48;
  if (hoursUntilEvent >= 0) return DYNAMIC_PRICING.EVENT.HOURS_LESS_24;
  return 1.0; // Event has passed, use base price
};

// Helper function to get dynamic pricing reason for events
export const getEventPricingReason = (hoursUntilEvent: number): string => {
  if (hoursUntilEvent >= 48) return "event_48_plus";
  if (hoursUntilEvent >= 24) return "event_24_48";
  if (hoursUntilEvent >= 0) return "event_less_24";
  return "event_passed";
}; 