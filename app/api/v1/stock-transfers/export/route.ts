import { stockTransferController } from "@/modules/inventory/controller/stock-transfer.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Same permission as the list route — exporting is still just viewing,
// in bulk.
export const GET = withApiAuth(stockTransferController.exportList, {
  feature: "STOCK_TRANSFER",
  permission: "STOCK_TRANSFER.VIEW",
});
