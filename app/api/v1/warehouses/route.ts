import { warehouseController } from "@/modules/warehouse/controller/warehouse.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// No `feature` gate: every tenant needs at least one warehouse to operate
// at all, so this isn't a plan-gated add-on — same reasoning as
// modules/tenant's self-service routes.
export const GET = withApiAuth(warehouseController.list, {
  permission: "WAREHOUSE.VIEW",
});

export const POST = withApiAuth(warehouseController.create, {
  permission: "WAREHOUSE.CREATE",
});
