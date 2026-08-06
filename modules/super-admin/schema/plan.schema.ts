import { z } from "zod";
import { nonNegativeDecimalString } from "@/shared/validation/decimal";

export const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  price: nonNegativeDecimalString,
  billingCycle: z.enum(["MONTHLY", "YEARLY"]),
  // Feature codes this plan includes — validated against the live Feature
  // catalog in the service layer (schema has no DB access).
  featureCodes: z.array(z.string()).optional(),
  // Omitted means unlimited — see shared/utils/plan-limits.ts.
  maxWarehouses: z.coerce.number().int().positive().optional(),
  maxUsers: z.coerce.number().int().positive().optional(),
});

// Same shape as create — updating a plan is a full replace, not a patch,
// same reasoning as plan.repository.ts's replaceFeatures.
export const updatePlanSchema = createPlanSchema;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
