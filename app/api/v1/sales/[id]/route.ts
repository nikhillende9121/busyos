import { saleController } from "@/modules/sales/controller/sale.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(saleController.getById, {
  feature: "SALES",
  permission: "SALE.VIEW",
});
