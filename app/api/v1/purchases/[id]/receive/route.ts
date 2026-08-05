import { purchaseController } from "@/modules/purchase/controller/purchase.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

// Feature-gated on PURCHASE, but a separate permission from PURCHASE.UPDATE:
// receiving stock has real inventory consequences and a tenant may want to
// restrict it to a narrower set of roles than "can edit a purchase order".
export const POST = withApiAuth<Params>(purchaseController.receive, {
  feature: "PURCHASE",
  permission: "PURCHASE.RECEIVE",
});
