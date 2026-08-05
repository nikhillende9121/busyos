import { purchaseController } from "@/modules/purchase/controller/purchase.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const POST = withApiAuth<Params>(purchaseController.confirm, {
  feature: "PURCHASE",
  permission: "PURCHASE.UPDATE",
});
