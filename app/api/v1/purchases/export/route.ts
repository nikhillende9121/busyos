import { purchaseController } from "@/modules/purchase/controller/purchase.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Same permission as the list route — exporting is still just viewing,
// in bulk.
export const GET = withApiAuth(purchaseController.exportList, {
  feature: "PURCHASE",
  permission: "PURCHASE.VIEW",
});
