import { unitController } from "@/modules/product/controller/unit.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(unitController.getById, {
  feature: "PRODUCT",
  permission: "UNIT.VIEW",
});

export const PUT = withApiAuth<Params>(unitController.update, {
  feature: "PRODUCT",
  permission: "UNIT.UPDATE",
});

export const DELETE = withApiAuth<Params>(unitController.remove, {
  feature: "PRODUCT",
  permission: "UNIT.DELETE",
});
