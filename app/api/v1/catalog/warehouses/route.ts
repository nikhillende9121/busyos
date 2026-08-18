import { warehouseController } from "@/modules/warehouse/controller/warehouse.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(warehouseController.list, {
  permission: "WAREHOUSE.VIEW",
});

export const POST = withApiAuth(warehouseController.create, {
  permission: "WAREHOUSE.CREATE",
});
