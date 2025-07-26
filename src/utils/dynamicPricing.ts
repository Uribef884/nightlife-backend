import { getDay, differenceInMinutes, isValid } from "date-fns";

const dayMap: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2,
  Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

const PRICING_RULES = {
  CLOSED_DAY: 0.7,         // 30% off if club is closed
  EARLY: 0.9,              // 10% off if >180min before open
  INVALID: 1,              // No discount if data is invalid
  EVENT_ADVANCE: 0.8,      // 20% off for event tickets bought in advance
  EVENT_8_14: 0.9,         // 10% off for event tickets 8-14 days out
  EVENT_3_OR_LESS: 1,      // No markup for event tickets <=3 days out
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
    if (!dayIndexes.includes(checkDay)) continue;
    const dayName = Object.keys(dayMap).find(key => dayMap[key] === checkDay);
    const hours = openHoursArr.find(h => h.day === dayName);
    if (!hours) continue;
    const [openHourNum, openMinuteNum] = hours.open.trim().split(":").map(Number);
    const [closeHourNum, closeMinuteNum] = hours.close.trim().split(":").map(Number);
    const open = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), openHourNum, openMinuteNum);
    let close = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), closeHourNum, closeMinuteNum);
    if (close <= open) close.setDate(close.getDate() + 1); // cross-midnight
    if (open > now) return { open, close };
    if (now >= open && now < close) return { open, close }; // currently open
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

  if (!basePrice || basePrice <= 0 || isNaN(basePrice)) return 0;
  if (basePrice === 0) return 0;

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
      return clampPrice(Math.round(basePrice * PRICING_RULES.CLOSED_DAY * 100) / 100, basePrice);
    } else if (minutesUntilEvent > 0) {
      // 3 hours or less before event: 10% off
      return clampPrice(Math.round(basePrice * PRICING_RULES.EARLY * 100) / 100, basePrice);
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
    return clampPrice(Math.round(basePrice * PRICING_RULES.CLOSED_DAY * 100) / 100, basePrice);
  }
  const { open, close } = nextOpenClose;
  if (now >= open && now < close) {
    // Currently open
    return basePrice;
  }
  const minutesUntilOpen = Math.round((open.getTime() - now.getTime()) / 60000);
  if (minutesUntilOpen > 180) {
    // More than 3 hours before next open: 30% off
    return clampPrice(Math.round(basePrice * PRICING_RULES.CLOSED_DAY * 100) / 100, basePrice);
  }
  // 3 hours or less before open: 10% off
  return clampPrice(Math.round(basePrice * PRICING_RULES.EARLY * 100) / 100, basePrice);
}

/**
 * Dynamic pricing for general covers (non-event tickets)
 */
export function computeDynamicCoverPrice(input: Omit<DynamicPriceInput, 'useDateBasedLogic'>): number {
  return computeDynamicPrice({ ...input, useDateBasedLogic: false });
}

/**
 * Dynamic pricing for event tickets (based on days until event)
 */
export function computeDynamicEventPrice(basePrice: number, eventDate: Date): number {
  if (!basePrice || basePrice <= 0 || isNaN(basePrice) || !(eventDate instanceof Date) || isNaN(eventDate.getTime())) {
    return 0;
  }
  if (basePrice === 0) return 0;
  const now = new Date();
  const daysUntilEvent = Math.floor(
    (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (isNaN(daysUntilEvent)) return basePrice;
  if (daysUntilEvent > 14) return clampPrice(Math.round(basePrice * PRICING_RULES.EVENT_ADVANCE * 100) / 100, basePrice);  // early bird
  if (daysUntilEvent > 7)  return clampPrice(Math.round(basePrice * PRICING_RULES.EVENT_8_14 * 100) / 100, basePrice);  // minor discount
  if (daysUntilEvent <= 3) return clampPrice(Math.round(basePrice * PRICING_RULES.EVENT_3_OR_LESS * 100) / 100, basePrice);  // no markup
  return basePrice;
}