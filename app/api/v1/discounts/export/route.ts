import { discountController } from "@/modules/pricing/controller/discount.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Same permission as the list route — exporting is still just viewing,
// in bulk.
export const GET = withApiAuth(discountController.exportList, {
  feature: "DISCOUNT",
  permission: "DISCOUNT.VIEW",
});
