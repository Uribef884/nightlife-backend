// src/schemas/auth.schema.ts
import { z } from "zod";

export const authSchemaRegister = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .trim()
    .transform((val) => val.toLowerCase()),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must include at least one uppercase letter")
    .regex(/[0-9]/, "Password must include at least one number")
    .trim(),
});

export const authSchemaLogin = z.object({
  email: z
    .string()
    .email("Invalid credentials")
    .trim()
    .transform((val) => val.toLowerCase()),

  password: z
    .string()
    .min(1, "Invalid credentials")
    .trim(),
});
