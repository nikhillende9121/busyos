import { z } from "zod";

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.email().optional(),
  phone: z.string().max(30).optional(),
  // Supplier's registered state — see
  // modules/pricing/service/tax.service.ts's CGST+SGST-vs-IGST split.
  state: z.string().max(50).optional(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
