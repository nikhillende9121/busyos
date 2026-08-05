import { saleController } from "@/modules/sales/controller/sale.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const POST = withApiAuth<Params>(saleController.pack, {
  feature: "SALES",
  permission: "SALE.UPDATE",
});
