import { unitController } from "@/modules/product/controller/unit.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(unitController.getById, {
  feature: "UNIT",
  permission: "UNIT.VIEW",
});

export const PUT = withApiAuth<Params>(unitController.update, {
  feature: "UNIT",
  permission: "UNIT.UPDATE",
});

export const DELETE = withApiAuth<Params>(unitController.remove, {
  feature: "UNIT",
  permission: "UNIT.DELETE",
});
