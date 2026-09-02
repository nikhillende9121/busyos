import { saleController } from "@/modules/sales/controller/sale.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Gated by SALE.SHIP, not USER.VIEW — whoever can ship an order needs to
// see who's eligible to receive it, even if their role doesn't otherwise
// have visibility into the user list.
export const GET = withApiAuth(saleController.listDeliveryAssignees, {
  feature: "SALES",
  permission: "SALE.SHIP",
});
