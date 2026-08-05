import { z } from "zod";

export const createFeatureSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(100),
});
export type CreateFeatureInput = z.infer<typeof createFeatureSchema>;
