import { stockTransferController } from "@/modules/inventory/controller/stock-transfer.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const POST = withApiAuth<Params>(stockTransferController.approve, {
  feature: "INVENTORY",
  permission: "STOCK_TRANSFER.APPROVE",
});
