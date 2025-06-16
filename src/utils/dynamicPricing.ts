import { getDay, differenceInMinutes } from "date-fns";

const dayMap: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function parseOpenHour(openHour: string): Date {
  const [start] = openHour.split("-");
  const [hour, minute] = start.trim().split(":").map(Number);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
}

export interface DynamicPriceInput {
  basePrice: number;
  clubOpenDays: string[];         // e.g., ["Friday", "Saturday"]
  openHours: string;              // e.g., "21:00-03:00"
  availableDate?: Date;           // for tickets
  useDateBasedLogic?: boolean;    // if true → apply date logic instead of time-based
}

/**
 * Computes a dynamic price with optional date-based or time-to-open logic
 */
export function computeDynamicPrice(input: DynamicPriceInput): number {
  const {
    basePrice,
    clubOpenDays,
    openHours,
    availableDate,
    useDateBasedLogic = false
  } = input;

  if (typeof basePrice !== "number" || isNaN(basePrice)) return 0;

  const now = new Date();

  if (useDateBasedLogic && availableDate) {
    const todayStr = now.toISOString().split("T")[0];
    const eventStr = availableDate.toISOString().split("T")[0];

    // If ticket is not for today → apply discount
    if (eventStr !== todayStr) {
      return Math.round(basePrice * 0.8 * 100) / 100; // 20% discount for future
    }

    return basePrice; // ticket is for today, charge full
  }

  const today = getDay(now); // 0 (Sun) - 6 (Sat)
  const isOpenToday = clubOpenDays.map(day => dayMap[day]).includes(today);

  if (!isOpenToday) {
    return Math.round(basePrice * 0.7 * 100) / 100; // 30% discount
  }

  const openTime = parseOpenHour(openHours);
  const minutesUntilOpen = differenceInMinutes(openTime, now);

  if (minutesUntilOpen > 180) {
    return Math.round(basePrice * 0.9 * 100) / 100; // 10% discount
  }

  return basePrice;
}

/**
 * Dynamic pricing for general covers (based on club open status and hours)
 */
export function computeDynamicCoverPrice(input: Omit<DynamicPriceInput, 'useDateBasedLogic'>): number {
  return computeDynamicPrice({ ...input, useDateBasedLogic: false });
}

/**
 * Dynamic pricing for event tickets (based on days until event)
 */
export function computeDynamicEventPrice(basePrice: number, eventDate: Date): number {
  const now = new Date();
  const daysUntilEvent = Math.floor(
    (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilEvent > 14) return Math.round(basePrice * 0.8 * 100) / 100;  // early bird
  if (daysUntilEvent > 7)  return Math.round(basePrice * 0.9 * 100) / 100;  // minor discount
  if (daysUntilEvent <= 3) return Math.round(basePrice * 1.1 * 100) / 100;  // urgency bump

  return basePrice; // standard price
}