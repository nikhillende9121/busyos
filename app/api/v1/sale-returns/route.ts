import { saleReturnController } from "@/modules/sales/controller/sale-return.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(saleReturnController.list, {
  feature: "SALE_RETURN",
  permission: "SALE_RETURN.VIEW",
});

export const POST = withApiAuth(saleReturnController.create, {
  feature: "SALE_RETURN",
  permission: "SALE_RETURN.CREATE",
});
