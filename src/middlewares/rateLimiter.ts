import rateLimit from "express-rate-limit";

export const rateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 10 minutes   windowMs: 10 * 60 * 1000
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",
});
