import { z } from "zod";
import { optionalIdString } from "@/shared/validation/id";
import { nullableNonNegativeDecimalString } from "@/shared/validation/decimal";

// All optional: this is a partial update (PUT .../me/settings) — the
// service upserts only the fields provided, see tenant.service.ts.
export const updateTenantSettingsSchema = z.object({
  companyName: z.string().min(1).max(150).optional(),
  gstNumber: z.string().max(30).optional(),
  currency: z
    .string()
    .length(3, "currency must be an ISO 4217 code, e.g. INR")
    .optional(),
  timezone: z.string().min(1).max(50).optional(),
  invoicePrefix: z.string().max(20).optional(),
  decimalPrecision: z.number().int().min(0).max(4).optional(),
  // GST configuration — see modules/pricing/service/tax.service.ts.
  homeState: z.string().max(50).optional(),
  taxInclusivePricing: z.boolean().optional(),
  defaultTaxRateId: optionalIdString,
  // Tenant-wide fallback max credit balance for CustomerCredit.creditLimit —
  // null clears it back to "no tenant default" (unlimited unless a customer
  // has their own override). Only meaningful while the CREDIT_PAYMENT
  // feature is enabled, but not rejected here if it isn't — see
  // Docs/credit_module_plan.md §3.3.
  defaultCreditLimit: nullableNonNegativeDecimalString,
});

export type UpdateTenantSettingsInput = z.infer<typeof updateTenantSettingsSchema>;
