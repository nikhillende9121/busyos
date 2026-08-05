import { inventoryController } from "@/modules/inventory/controller/inventory.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const POST = withApiAuth(inventoryController.createStockAdjustment, {
  feature: "INVENTORY",
  permission: "INVENTORY.ADJUST",
});
