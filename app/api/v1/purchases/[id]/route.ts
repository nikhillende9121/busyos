import { purchaseController } from "@/modules/purchase/controller/purchase.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(purchaseController.getById, {
  feature: "PURCHASE",
  permission: "PURCHASE.VIEW",
});
