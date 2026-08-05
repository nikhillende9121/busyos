import { inventoryController } from "@/modules/inventory/controller/inventory.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(inventoryController.listBalances, {
  feature: "INVENTORY",
  permission: "INVENTORY.VIEW",
});
