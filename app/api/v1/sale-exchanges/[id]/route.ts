import { saleExchangeController } from "@/modules/sales/controller/sale-exchange.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(saleExchangeController.getById, {
  feature: "SALE_EXCHANGE",
  permission: "SALE_RETURN.VIEW",
});
