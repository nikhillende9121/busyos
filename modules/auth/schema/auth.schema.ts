import { z } from "zod";

// tenantCode is required at login: email is unique per tenant, not globally
// (see Docs/DATABASE.md -> Multi-Column Uniqueness), so the tenant must be
// resolved before a user row can even be looked up. This is the "Resolve
// Tenant" pipeline step happening at the earliest possible point.
export const loginSchema = z.object({
  tenantCode: z.string().min(1, "tenantCode is required"),
  email: z.email(),
  password: z.string().min(8, "password must be at least 8 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

export type RefreshInput = z.infer<typeof refreshSchema>;
