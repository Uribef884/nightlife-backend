import rateLimit from "express-rate-limit";

export const rateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 10 minutes   windowMs: 10 * 60 * 1000
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",
});

// 🔐 Rate Limiting on Auth and Search
// ✅ Why: Prevent brute force + spam
export const loginLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many login attempts, please try again later.",
});

export const searchLimiter = rateLimit({ 
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 searches per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many search requests, please try again later.",
});

// 🔐 Rate Limiting for Create Operations
// ✅ Why: Prevent spam and abuse of creation endpoints
export const createLimiter = rateLimit({ 
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 creations per 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many creation requests, please try again later.",
});

// 🔐 Rate Limiting for QR Validation
// ✅ Why: Prevent abuse of QR validation endpoints
export const qrValidationLimiter = rateLimit({ 
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 QR validations per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many QR validation requests, please try again later.",
});
