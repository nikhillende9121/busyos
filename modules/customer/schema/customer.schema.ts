import { z } from "zod";
import { idString, optionalIdString } from "@/shared/validation/id";

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  customerGroupId: optionalIdString,
  // Billing state — see modules/pricing/service/tax.service.ts's
  // CGST+SGST-vs-IGST split.
  state: z.string().max(50).optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
