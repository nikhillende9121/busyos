import { extraChargeController } from "@/modules/extra-charge/controller/extra-charge.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(extraChargeController.getById, {
  feature: "EXTRA_CHARGE",
  permission: "EXTRA_CHARGE.VIEW",
});

export const PUT = withApiAuth<Params>(extraChargeController.update, {
  feature: "EXTRA_CHARGE",
  permission: "EXTRA_CHARGE.UPDATE",
});

export const DELETE = withApiAuth<Params>(extraChargeController.remove, {
  feature: "EXTRA_CHARGE",
  permission: "EXTRA_CHARGE.DELETE",
});
