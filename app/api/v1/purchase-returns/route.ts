import { purchaseReturnController } from "@/modules/purchase/controller/purchase-return.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(purchaseReturnController.list, {
  feature: "PURCHASE",
  permission: "PURCHASE_RETURN.VIEW",
});

export const POST = withApiAuth(purchaseReturnController.create, {
  feature: "PURCHASE",
  permission: "PURCHASE_RETURN.CREATE",
});
