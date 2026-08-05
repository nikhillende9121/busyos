import { saleController } from "@/modules/sales/controller/sale.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

// Separate permission from SALE.UPDATE, same reasoning as
// PURCHASE.RECEIVE: this is the one step with real inventory consequences.
export const POST = withApiAuth<Params>(saleController.confirm, {
  feature: "SALES",
  permission: "SALE.CONFIRM",
});
