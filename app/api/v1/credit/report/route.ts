import { creditController } from "@/modules/credit/controller/credit.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(creditController.getReport, {
  feature: "CREDIT_PAYMENT",
  permission: "CREDIT.VIEW",
});
