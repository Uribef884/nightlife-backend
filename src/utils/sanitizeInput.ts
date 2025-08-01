// src/utils/sanitizeInput.ts
import { escape } from "validator";

/**
 * Sanitizes a string input by trimming, removing dangerous characters,
 * and ensuring it's not empty or invalid.
 *
 * @param value - Input value to sanitize
 * @param options - Sanitization options
 * @returns A sanitized string or null if invalid
 */
export function sanitizeInput(value: unknown, options: {
  escapeHtml?: boolean;
  removeQuotes?: boolean;
  maxLength?: number;
} = {}): string | null {
  const { escapeHtml = true, removeQuotes = true, maxLength } = options;

  if (typeof value !== "string") return null;

  let cleaned = value.trim();

  // Remove control characters and common XSS vectors
  cleaned = cleaned
    .replace(/[\u0000-\u001F\u007F]/g, "") // remove control characters
    .replace(/<[^>]*>?/gm, "");           // remove HTML tags

  // Escape HTML entities if requested
  if (escapeHtml) {
    cleaned = escape(cleaned);
  }

  // Remove quote-related symbols if requested
  if (removeQuotes) {
    cleaned = cleaned.replace(/["'`;]/g, "");
  }

  // Apply max length if specified
  if (maxLength && cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength);
  }

  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Sanitizes an array of strings
 */
export function sanitizeStringArray(value: unknown, options?: {
  escapeHtml?: boolean;
  removeQuotes?: boolean;
  maxLength?: number;
}): string[] | null {
  if (!Array.isArray(value)) return null;
  
  const sanitized = value
    .map(item => sanitizeInput(item, options))
    .filter((item): item is string => item !== null);
  
  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Sanitizes an object with string properties
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  stringKeys: (keyof T)[],
  options?: {
    escapeHtml?: boolean;
    removeQuotes?: boolean;
    maxLength?: number;
  }
): T {
  const sanitized = { ...obj } as T;
  
  for (const key of stringKeys) {
    if (typeof obj[key] === "string") {
      const sanitizedValue = sanitizeInput(obj[key], options);
      if (sanitizedValue !== null) {
        (sanitized as any)[key] = sanitizedValue;
      }
    }
  }
  
  return sanitized;
}
