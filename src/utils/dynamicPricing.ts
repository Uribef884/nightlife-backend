import { getDay, differenceInMinutes, isValid } from "date-fns";
import { DYNAMIC_PRICING, getEventPricingMultiplier, getEventPricingReason } from "../config/fees";

const dayMap: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2,
  Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

const PRICING_RULES = {
  CLOSED_DAY: DYNAMIC_PRICING.CLOSED_DAY,
  EARLY: DYNAMIC_PRICING.EARLY,
  INVALID: 1,              // No discount if data is invalid
  EVENT_48_PLUS: DYNAMIC_PRICING.EVENT.HOURS_48_PLUS,
  EVENT_24_48: DYNAMIC_PRICING.EVENT.HOURS_24_48,
  EVENT_LESS_24: DYNAMIC_PRICING.EVENT.HOURS_LESS_24,
};

function clampPrice(price: number, basePrice: number): number {
  // Ensure price is not negative and not more than basePrice
  if (price < 0) return 0;
  if (price > basePrice) return basePrice;
  return price;
}

function parseOpenHour(openHour: string): { open: Date, close: Date } | null {
  try {
    const [openStr, closeStr] = openHour.split('-');
    const [openHourNum, openMinuteNum] = openStr.trim().split(':').map(Number);
    const [closeHourNum, closeMinuteNum] = closeStr.trim().split(':').map(Number);
    const now = new Date();
    const open = new Date(now.getFullYear(), now.getMonth(), now.getDate(), openHourNum, openMinuteNum);
    let close = new Date(now.getFullYear(), now.getMonth(), now.getDate(), closeHourNum, closeMinuteNum);
    if (close <= open) {
      // Crosses midnight, so close is next day
      close.setDate(close.getDate() + 1);
    }
    return { open, close };
  } catch {
    return null;
  }
}

function getNextOpenClose(now: Date, openHoursArr: { day: string, open: string, close: string }[], clubOpenDays: string[]): { open: Date, close: Date } | null {
  // Returns the next open and close Date objects after 'now', or null if not found
  const dayIndexes = clubOpenDays.map(day => dayMap[day]);
  
  for (let offset = 0; offset < 8; offset++) { // look up to a week ahead
    const checkDate = new Date(now);
    checkDate.setDate(now.getDate() + offset);
    const checkDay = checkDate.getDay();
    
    if (!dayIndexes.includes(checkDay)) {
      continue;
    }
    
    const dayName = Object.keys(dayMap).find(key => dayMap[key] === checkDay);
    const hours = openHoursArr.find(h => h.day === dayName);
    if (!hours) {
      continue;
    }
    
    const [openHourNum, openMinuteNum] = hours.open.trim().split(":").map(Number);
    const [closeHourNum, closeMinuteNum] = hours.close.trim().split(":").map(Number);
    
    const open = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), openHourNum, openMinuteNum);
    let close = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), closeHourNum, closeMinuteNum);
    
    if (close <= open) {
      close.setDate(close.getDate() + 1); // cross-midnight
    }
    
    if (open > now) {
      return { open, close };
    }
    if (now >= open && now < close) {
      return { open, close };
    }
  }
  
  return null;
}

export interface DynamicPriceInput {
  basePrice: number;
  clubOpenDays: string[];
  openHours: string | { day: string, open: string, close: string }[];
  availableDate?: Date;
  useDateBasedLogic?: boolean;
}

/**
 * Generic dynamic pricing function:
 * - Applies time-to-open discount for general covers and menu
 * - Applies date-based logic for event tickets if useDateBasedLogic = true
 */
export function computeDynamicPrice(input: DynamicPriceInput): number {
  const {
    basePrice,
    clubOpenDays,
    openHours,
    availableDate,
    useDateBasedLogic = false
  } = input;

  if (!basePrice || basePrice <= 0 || isNaN(basePrice)) {
    return 0;
  }
  if (basePrice === 0) {
    return 0;
  }

  const now = new Date();

  // 🎟️ EVENT TICKET LOGIC - Use same time-based rules as regular tickets
  if (useDateBasedLogic && availableDate) {
    // Ensure availableDate is a Date object
    const eventDate = availableDate instanceof Date ? availableDate : new Date(availableDate);
    if (isNaN(eventDate.getTime())) {
      console.error('[DP] Invalid availableDate:', availableDate);
      return basePrice;
    }
    
    // For event tickets, treat the event date as the "next open time"
    const minutesUntilEvent = Math.round((eventDate.getTime() - now.getTime()) / 60000);
    
    if (minutesUntilEvent > 180) {
      // More than 3 hours before event: 30% off
      const discountedPrice = clampPrice(Math.round(basePrice * PRICING_RULES.CLOSED_DAY * 100) / 100, basePrice);
      return discountedPrice;
    } else if (minutesUntilEvent > 0) {
      // 3 hours or less before event: 10% off
      const discountedPrice = clampPrice(Math.round(basePrice * PRICING_RULES.EARLY * 100) / 100, basePrice);
      return discountedPrice;
    } else {
      // Event has started or passed: full price
      return basePrice;
    }
  }

  // 📆 General Day/Time-Based Logic (covers, menu)
  let openHoursArr = Array.isArray(openHours) ? openHours : [];
  if (!Array.isArray(openHours) && typeof openHours === "string") {
    // fallback: treat as always open
    return basePrice;
  }
  
  const nextOpenClose = getNextOpenClose(now, openHoursArr, clubOpenDays);
  
  if (!nextOpenClose) {
    // No open hours found in the next week, treat as closed
    const discountedPrice = clampPrice(Math.round(basePrice * PRICING_RULES.CLOSED_DAY * 100) / 100, basePrice);
    return discountedPrice;
  }
  
  const { open, close } = nextOpenClose;
  
  if (now >= open && now < close) {
    // Currently open
    return basePrice;
  }
  
  const minutesUntilOpen = Math.round((open.getTime() - now.getTime()) / 60000);
  
  if (minutesUntilOpen > 180) {
    // More than 3 hours before next open: 30% off
    const discountedPrice = clampPrice(Math.round(basePrice * PRICING_RULES.CLOSED_DAY * 100) / 100, basePrice);
    return discountedPrice;
  }
  
  // 3 hours or less before open: 10% off
  const discountedPrice = clampPrice(Math.round(basePrice * PRICING_RULES.EARLY * 100) / 100, basePrice);
  return discountedPrice;
}

/**
 * Dynamic pricing for general covers (non-event tickets)
 */
export function computeDynamicCoverPrice(input: Omit<DynamicPriceInput, 'useDateBasedLogic'>): number {
  return computeDynamicPrice({ ...input, useDateBasedLogic: false });
}

/**
 * Get dynamic pricing reason for normal tickets (covers, menu)
 */
export function getNormalTicketDynamicPricingReason(input: DynamicPriceInput): string | undefined {
  const {
    clubOpenDays,
    openHours,
  } = input;

  const now = new Date();
  let openHoursArr = Array.isArray(openHours) ? openHours : [];
  
  if (!Array.isArray(openHours) && typeof openHours === "string") {
    return undefined; // No dynamic pricing
  }
  
  const nextOpenClose = getNextOpenClose(now, openHoursArr, clubOpenDays);
  
  if (!nextOpenClose) {
    // No open hours found in the next week, treat as closed
    return "closed_day";
  }
  
  const { open, close } = nextOpenClose;
  
  if (now >= open && now < close) {
    // Currently open
    return undefined; // No discount
  }
  
  const minutesUntilOpen = Math.round((open.getTime() - now.getTime()) / 60000);
  
  if (minutesUntilOpen > 180) {
    // More than 3 hours before next open: 30% off
    return "closed_day";
  }
  
  // 3 hours or less before open: 10% off
  return "early";
}

/**
 * Get dynamic pricing reason for event tickets
 */
export function getEventTicketDynamicPricingReason(eventDate: Date, eventOpenHours?: { open: string, close: string }): string | undefined {
  if (!(eventDate instanceof Date) || isNaN(eventDate.getTime())) {
    return undefined;
  }
  
  // Combine event date with event open time to get the actual event start time
  let eventStartTime = new Date(eventDate);
  
  if (eventOpenHours && eventOpenHours.open) {
    const [openHour, openMinute] = eventOpenHours.open.split(':').map(Number);
    
    // Handle the case where eventDate is a date string from database (like "2025-07-29")
    if (eventDate.toISOString().includes('T00:00:00')) {
      // This is a date-only string from database, create proper event time
      const dateStr = eventDate.toISOString().split('T')[0];
      const [year, month, day] = dateStr.split('-').map(Number);
      
      // Create event start time in local timezone (Colombian time)
      eventStartTime = new Date(year, month - 1, day, openHour, openMinute, 0, 0);
    } else {
      // This is already a proper datetime, just set the hours
      eventStartTime = new Date(eventDate);
      eventStartTime.setHours(openHour, openMinute, 0, 0);
    }
  }
  
  const now = new Date();
  const hoursUntilEvent = Math.floor(
    (eventStartTime.getTime() - now.getTime()) / (1000 * 60 * 60)
  );
  
  if (isNaN(hoursUntilEvent)) {
    return undefined;
  }
  
  if (hoursUntilEvent >= 48) {
    // 48+ hours away: 30% discount
    return "event_advance";
  }
  if (hoursUntilEvent >= 24) {
    // 24-48 hours away: base price
    return undefined; // No discount
  }
  if (hoursUntilEvent >= 0) {
    // Less than 24 hours: 20% surplus
    return "event_last_minute";
  }
  
  // Event has started - check grace period
  const hoursSinceEventStarted = Math.abs(hoursUntilEvent);
  if (hoursSinceEventStarted <= 1) {
    // Within 1 hour grace period: 30% surplus
    return "event_grace_period";
  }
  
  // Event has passed grace period: blocked
  return "event_expired";
}

/**
 * Dynamic pricing for event tickets (based on hours until event)
 */
export function computeDynamicEventPrice(basePrice: number, eventDate: Date, eventOpenHours?: { open: string, close: string }): number {
  if (!basePrice || basePrice <= 0 || isNaN(basePrice) || !(eventDate instanceof Date) || isNaN(eventDate.getTime())) {
    return 0;
  }
  if (basePrice === 0) {
    return 0;
  }
  
  // Combine event date with event open time to get the actual event start time
  let eventStartTime = new Date(eventDate);
  
  if (eventOpenHours && eventOpenHours.open) {
    const [openHour, openMinute] = eventOpenHours.open.split(':').map(Number);
    
    // Handle the case where eventDate is a date string from database (like "2025-07-29")
    // We need to create the event start time properly
    if (eventDate.toISOString().includes('T00:00:00')) {
      // This is a date-only string from database, create proper event time
      const dateStr = eventDate.toISOString().split('T')[0];
      const [year, month, day] = dateStr.split('-').map(Number);
      
      // Create event start time in local timezone (Colombian time)
      eventStartTime = new Date(year, month - 1, day, openHour, openMinute, 0, 0);
    } else {
      // This is already a proper datetime, just set the hours
      eventStartTime = new Date(eventDate);
      eventStartTime.setHours(openHour, openMinute, 0, 0);
    }
  }
  
  const now = new Date();
  
  const hoursUntilEvent = Math.floor(
    (eventStartTime.getTime() - now.getTime()) / (1000 * 60 * 60)
  );
  
  if (isNaN(hoursUntilEvent)) {
    return basePrice;
  }
  
  if (hoursUntilEvent >= 48) {
    // 48+ hours away: 30% discount
    const multiplier = getEventPricingMultiplier(hoursUntilEvent);
    const discountedPrice = Math.round(basePrice * multiplier * 100) / 100;
    return discountedPrice;
  }
  if (hoursUntilEvent >= 24) {
    // 24-48 hours away: base price
    const multiplier = getEventPricingMultiplier(hoursUntilEvent);
    const basePriceResult = Math.round(basePrice * multiplier * 100) / 100;
    return basePriceResult;
  }
  if (hoursUntilEvent >= 0) {
    // Less than 24 hours: 20% surplus
    const multiplier = getEventPricingMultiplier(hoursUntilEvent);
    const surplusPrice = Math.round(basePrice * multiplier * 100) / 100;
    return surplusPrice;
  }
  
  // Event has started - check grace period
  const hoursSinceEventStarted = Math.abs(hoursUntilEvent);
  if (hoursSinceEventStarted <= 1) {
    // Within 1 hour grace period: 30% surplus
    const gracePeriodPrice = Math.round(basePrice * 1.3 * 100) / 100;
    return gracePeriodPrice;
  }
  
  // Event has passed grace period: block purchase
  return -1; // Special value to indicate blocked purchase
}