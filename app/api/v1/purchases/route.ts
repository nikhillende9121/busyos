import { purchaseController } from "@/modules/purchase/controller/purchase.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(purchaseController.list, {
  feature: "PURCHASE",
  permission: "PURCHASE.VIEW",
});

export const POST = withApiAuth(purchaseController.create, {
  feature: "PURCHASE",
  permission: "PURCHASE.CREATE",
});
