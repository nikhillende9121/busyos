import { z } from "zod";

export const createCustomerGroupSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50),
});
export type CreateCustomerGroupInput = z.infer<typeof createCustomerGroupSchema>;

export const updateCustomerGroupSchema = createCustomerGroupSchema.partial();
export type UpdateCustomerGroupInput = z.infer<typeof updateCustomerGroupSchema>;
