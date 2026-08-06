import { stockTransferController } from "@/modules/inventory/controller/stock-transfer.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(stockTransferController.list, {
  feature: "STOCK_TRANSFER",
  permission: "STOCK_TRANSFER.VIEW",
});

export const POST = withApiAuth(stockTransferController.create, {
  feature: "STOCK_TRANSFER",
  permission: "STOCK_TRANSFER.CREATE",
});
