import { z } from "zod";
import { nonNegativeDecimalString } from "@/shared/validation/decimal";

export const createTaxRateSchema = z.object({
  name: z.string().min(1).max(100),
  hsnCode: z.string().max(20).optional(),
  sacCode: z.string().max(20).optional(),
  ratePercent: nonNegativeDecimalString,
  cessPercent: nonNegativeDecimalString.optional(),
});
export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;

export const updateTaxRateSchema = createTaxRateSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateTaxRateInput = z.infer<typeof updateTaxRateSchema>;
