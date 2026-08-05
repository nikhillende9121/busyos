import { saleReturnController } from "@/modules/sales/controller/sale-return.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(saleReturnController.getById, {
  feature: "SALES",
  permission: "SALE_RETURN.VIEW",
});
