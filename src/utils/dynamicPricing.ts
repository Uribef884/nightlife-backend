import { getDay, differenceInMinutes, isValid } from "date-fns";

const dayMap: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2,
  Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

function parseOpenHour(openHour: string): Date | null {
  try {
    const [start] = openHour.split("-");
    const [hour, minute] = start.trim().split(":").map(Number);
    const now = new Date();
    const parsed = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface DynamicPriceInput {
  basePrice: number;
  clubOpenDays: string[];
  openHours: string;
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

  const now = new Date();

  // 🎟️ EVENT TICKET LOGIC
  if (useDateBasedLogic && availableDate) {
    const todayStr = now.toISOString().split("T")[0];
    const eventStr = availableDate.toISOString().split("T")[0];

    if (eventStr !== todayStr) {
      return Math.round(basePrice * 0.8 * 100) / 100; // 20% discount for advance purchase
    }

    return basePrice;
  }

  // 📆 General Day/Time-Based Logic (covers, menu)
  const today = getDay(now); // 0-6
  const isOpenToday = clubOpenDays.map(day => dayMap[day]).includes(today);

  if (!isOpenToday) {
    return Math.round(basePrice * 0.7 * 100) / 100; // 30% discount if closed today
  }

  if (!openHours || typeof openHours !== "string" || !openHours.includes("-")) {
    return Math.round(basePrice * 0.85 * 100) / 100; // fallback if openHours invalid
  }

  const openTime = parseOpenHour(openHours);
  if (!openTime) {
    console.warn("⚠️ Invalid openHours format:", openHours);
    return Math.round(basePrice * 0.85 * 100) / 100;
  }

  const minutesUntilOpen = differenceInMinutes(openTime, now);
  if (isNaN(minutesUntilOpen)) {
    console.warn("⚠️ Cannot compute minutesUntilOpen:", openTime, now);
    return Math.round(basePrice * 0.85 * 100) / 100;
  }

  if (minutesUntilOpen > 180) {
    return Math.round(basePrice * 0.9 * 100) / 100; // early discount
  }

  return basePrice; // full price by default
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

  const now = new Date();
  const daysUntilEvent = Math.floor(
    (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (isNaN(daysUntilEvent)) return basePrice;

  if (daysUntilEvent > 14) return Math.round(basePrice * 0.8 * 100) / 100;  // early bird
  if (daysUntilEvent > 7)  return Math.round(basePrice * 0.9 * 100) / 100;  // minor discount
  if (daysUntilEvent <= 3) return Math.round(basePrice * 1.1 * 100) / 100;  // urgency bump

  return basePrice;
}