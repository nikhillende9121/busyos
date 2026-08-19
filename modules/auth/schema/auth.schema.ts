import { z } from "zod";

// Email and password login — tenant is resolved from the user's active tenant association
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "password must be at least 8 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

export type RefreshInput = z.infer<typeof refreshSchema>;
