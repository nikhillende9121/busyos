import { purchaseReturnController } from "@/modules/purchase/controller/purchase-return.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(purchaseReturnController.getById, {
  feature: "PURCHASE_RETURN",
  permission: "PURCHASE_RETURN.VIEW",
});
