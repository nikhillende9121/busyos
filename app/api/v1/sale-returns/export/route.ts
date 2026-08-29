import { saleReturnController } from "@/modules/sales/controller/sale-return.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Same permission as the list route — exporting is still just viewing,
// in bulk.
export const GET = withApiAuth(saleReturnController.exportList, {
  feature: "SALE_RETURN",
  permission: "SALE_RETURN.VIEW",
});
