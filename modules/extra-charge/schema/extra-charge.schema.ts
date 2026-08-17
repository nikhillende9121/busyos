import { z } from "zod";
import { nonNegativeDecimalString } from "@/shared/validation/decimal";
import { idString, optionalIdString } from "@/shared/validation/id";

export const createExtraChargeSchema = z.object({
  name: z.string().min(1).max(100),
  calcType: z.enum(["FLAT", "PERCENTAGE"]),
  value: nonNegativeDecimalString,
  isTaxable: z.boolean().optional(),
  taxRateId: optionalIdString,
  applicableChannels: z.array(z.enum(["POS", "ONLINE", "MARKETPLACE", "PHONE"])).optional(),
});
export type CreateExtraChargeInput = z.infer<typeof createExtraChargeSchema>;

export const updateExtraChargeSchema = createExtraChargeSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateExtraChargeInput = z.infer<typeof updateExtraChargeSchema>;
