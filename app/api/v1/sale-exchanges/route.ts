import { saleExchangeController } from "@/modules/sales/controller/sale-exchange.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(saleExchangeController.list, {
  feature: "SALES",
  permission: "SALE_RETURN.VIEW",
});

export const POST = withApiAuth(saleExchangeController.create, {
  feature: "SALES",
  permission: "SALE.EXCHANGE",
});
