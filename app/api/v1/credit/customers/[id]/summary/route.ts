import { creditController } from "@/modules/credit/controller/credit.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

// POS-facing — see Docs/credit_module_plan.md §10. CREDIT.VIEW must be part
// of the Cashier/POS role's permission set for this to be usable at
// checkout, not just back-office roles.
export const GET = withApiAuth<Params>(creditController.getSummary, {
  feature: "CREDIT_PAYMENT",
  permission: "CREDIT.VIEW",
});
