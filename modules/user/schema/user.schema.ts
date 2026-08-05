import { z } from "zod";
import { idString } from "@/shared/validation/id";

export const createUserSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.email(),
  password: z.string().min(8, "password must be at least 8 characters"),
  roleId: idString,
  // Omitted/undefined = unrestricted (acts at any of the tenant's
  // warehouses); set = restricted to that one store — see
  // Docs/business-rules/roles-and-permissions.md -> Warehouse-Scoped Users.
  warehouseId: idString.optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

// Deliberately narrower than create, not createUserSchema.partial(): email
// has identity implications and password change deserves its own
// (not-yet-built) reset flow, so neither is editable through this generic
// update — flagged here rather than silently omitted. warehouseId IS
// editable here (reassigning a store manager to a different store is a
// normal, expected operation).
export const updateUserSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  roleId: idString.optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "INVITED"]).optional(),
  warehouseId: idString.nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
