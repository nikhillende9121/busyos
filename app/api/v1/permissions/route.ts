import { roleController } from "@/modules/role/controller/role.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Exists only to support the Roles page's permission checklist — gated on
// ROLE.VIEW rather than its own permission code, since it isn't a
// resource a tenant manages, just a fixed reference list.
export const GET = withApiAuth(roleController.listPermissions, {
  permission: "ROLE.VIEW",
});
