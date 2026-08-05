import { z } from "zod";

export const createUnitSchema = z.object({
  name: z.string().min(1).max(50),
  symbol: z.string().min(1).max(10),
});
export type CreateUnitInput = z.infer<typeof createUnitSchema>;

export const updateUnitSchema = createUnitSchema.partial();
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
