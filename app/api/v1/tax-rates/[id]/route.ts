import { taxRateController } from "@/modules/tax-rate/controller/tax-rate.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(taxRateController.getById, {
  permission: "TAX_RATE.VIEW",
});

export const PUT = withApiAuth<Params>(taxRateController.update, {
  permission: "TAX_RATE.UPDATE",
});

export const DELETE = withApiAuth<Params>(taxRateController.remove, {
  permission: "TAX_RATE.DELETE",
});
