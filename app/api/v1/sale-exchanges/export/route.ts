import { saleExchangeController } from "@/modules/sales/controller/sale-exchange.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Same permission as the list route — exporting is still just viewing,
// in bulk.
export const GET = withApiAuth(saleExchangeController.exportList, {
  feature: "SALE_EXCHANGE",
  permission: "SALE_RETURN.VIEW",
});
