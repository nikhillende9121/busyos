import { roleController } from "@/modules/role/controller/role.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// No `feature` gate: managing who has access is core account
// administration, not tied to an optional business-module flag — same
// reasoning as WAREHOUSE.*/TENANT.*.
export const GET = withApiAuth(roleController.list, {
  permission: "ROLE.VIEW",
});

export const POST = withApiAuth(roleController.create, {
  permission: "ROLE.CREATE",
});
