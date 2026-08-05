import { stockTransferController } from "@/modules/inventory/controller/stock-transfer.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(stockTransferController.getById, {
  feature: "INVENTORY",
  permission: "STOCK_TRANSFER.VIEW",
});
