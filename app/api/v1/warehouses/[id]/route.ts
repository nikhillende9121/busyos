import { warehouseController } from "@/modules/warehouse/controller/warehouse.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(warehouseController.getById, {
  permission: "WAREHOUSE.VIEW",
});

export const PUT = withApiAuth<Params>(warehouseController.update, {
  permission: "WAREHOUSE.UPDATE",
});

export const DELETE = withApiAuth<Params>(warehouseController.remove, {
  permission: "WAREHOUSE.DELETE",
});
