import { z } from "zod";
import { authSchemaRegister } from "./auth.schema";

export const forgotPasswordSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: authSchemaRegister.shape.password,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;