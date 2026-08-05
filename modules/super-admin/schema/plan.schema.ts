import { z } from "zod";
import { nonNegativeDecimalString } from "@/shared/validation/decimal";

export const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  price: nonNegativeDecimalString,
  billingCycle: z.enum(["MONTHLY", "YEARLY"]),
  // Feature codes this plan includes — validated against the live Feature
  // catalog in the service layer (schema has no DB access).
  featureCodes: z.array(z.string()).optional(),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
