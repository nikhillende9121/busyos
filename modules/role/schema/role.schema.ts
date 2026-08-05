import { z } from "zod";

export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(100),
  // Codes are validated against the live Permission catalog in the
  // service layer, not here — the schema layer doesn't have DB access
  // (see MODULES.md -> schema/ vs service/).
  permissionCodes: z.array(z.string()).optional(),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.partial();
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
