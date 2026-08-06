import { z } from "zod";
import { idString } from "@/shared/validation/id";

// Creating a tenant also bootstraps its first Admin role (every current
// permission granted) and its first admin User — see
// modules/super-admin/service/tenant.service.ts. Without this, a newly
// created tenant would have no way for anyone to ever log into it.
export const createTenantSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(50),
  planId: idString,
  adminName: z.string().min(1).max(150),
  adminEmail: z.email(),
  adminPassword: z.string().min(8, "adminPassword must be at least 8 characters"),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantStatusSchema = z.object({
  status: z.enum(["ACTIVE", "TRIAL", "SUSPENDED", "CANCELLED"]),
});
export type UpdateTenantStatusInput = z.infer<typeof updateTenantStatusSchema>;

export const changeTenantPlanSchema = z.object({
  planId: idString,
});
export type ChangeTenantPlanInput = z.infer<typeof changeTenantPlanSchema>;
