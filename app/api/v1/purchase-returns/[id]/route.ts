import { purchaseReturnController } from "@/modules/purchase/controller/purchase-return.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(purchaseReturnController.getById, {
  feature: "PURCHASE",
  permission: "PURCHASE_RETURN.VIEW",
});
