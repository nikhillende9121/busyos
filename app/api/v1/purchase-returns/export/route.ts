import { purchaseReturnController } from "@/modules/purchase/controller/purchase-return.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Same permission as the list route — exporting is still just viewing,
// in bulk.
export const GET = withApiAuth(purchaseReturnController.exportList, {
  feature: "PURCHASE_RETURN",
  permission: "PURCHASE_RETURN.VIEW",
});
