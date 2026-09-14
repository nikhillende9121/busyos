import { creditController } from "@/modules/credit/controller/credit.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(creditController.getConfig, {
  feature: "CREDIT_PAYMENT",
  permission: "CREDIT.VIEW",
});

export const PATCH = withApiAuth<Params>(creditController.updateConfig, {
  feature: "CREDIT_PAYMENT",
  permission: "CREDIT.MANAGE",
});
