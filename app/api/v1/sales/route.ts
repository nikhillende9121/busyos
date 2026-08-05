import { saleController } from "@/modules/sales/controller/sale.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(saleController.list, {
  feature: "SALES",
  permission: "SALE.VIEW",
});

export const POST = withApiAuth(saleController.create, {
  feature: "SALES",
  permission: "SALE.CREATE",
});
