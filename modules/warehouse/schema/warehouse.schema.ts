import { z } from "zod";

export const createWarehouseSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(50),
  address: z.string().max(2000).optional(),
  // The state this warehouse/GSTIN is registered in — see
  // modules/pricing/service/tax.service.ts's CGST+SGST-vs-IGST split.
  state: z.string().max(50).optional(),
});
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

export const updateWarehouseSchema = createWarehouseSchema.partial();
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
