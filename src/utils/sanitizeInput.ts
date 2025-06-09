// src/utils/sanitizeInput.ts

/**
 * Sanitizes a string input by trimming, removing dangerous characters,
 * and ensuring it's not empty or invalid.
 *
 * @param value - Input value to sanitize
 * @returns A sanitized string or null if invalid
 */
export function sanitizeInput(value: unknown): string | null {
  if (typeof value !== "string") return null;

  let cleaned = value.trim();

  // Remove control characters and common XSS vectors
  cleaned = cleaned
    .replace(/<[^>]*>?/gm, "")           // remove HTML tags
    .replace(/[\u0000-\u001F\u007F]/g, "") // remove control characters
    .replace(/["'`;]/g, "");               // remove quote-related symbols

  return cleaned.length > 0 ? cleaned : null;
}
