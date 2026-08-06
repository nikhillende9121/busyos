import { saleExchangeController } from "@/modules/sales/controller/sale-exchange.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(saleExchangeController.list, {
  feature: "SALE_EXCHANGE",
  permission: "SALE_RETURN.VIEW",
});

export const POST = withApiAuth(saleExchangeController.create, {
  feature: "SALE_EXCHANGE",
  permission: "SALE.EXCHANGE",
});
