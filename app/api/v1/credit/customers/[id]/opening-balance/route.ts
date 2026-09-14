import { creditController } from "@/modules/credit/controller/credit.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const POST = withApiAuth<Params>(creditController.recordOpeningBalance, {
  feature: "CREDIT_PAYMENT",
  permission: "CREDIT.MANAGE",
});
