import { z } from "zod";
import { idString } from "@/shared/validation/id";

export const createCategorySchema = z.object({
  name: z.string().min(1).max(150),
  parentId: idString.optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
