/**
 * Normalizes an ISO date string to UTC midnight
 * Example: "2025-06-10" → 2025-06-10T00:00:00.000Z
 */
export function normalizeToUtcMidnight(input: string | Date): Date {
  const date = typeof input === "string" ? new Date(`${input}T00:00:00Z`) : input;
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return utcDate;
}
