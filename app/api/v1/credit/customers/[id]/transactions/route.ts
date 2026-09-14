import { creditController } from "@/modules/credit/controller/credit.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(creditController.listTransactions, {
  feature: "CREDIT_PAYMENT",
  permission: "CREDIT.VIEW",
});
