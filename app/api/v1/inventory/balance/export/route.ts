import { inventoryController } from "@/modules/inventory/controller/inventory.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Same permission as the list route — exporting is still just viewing,
// in bulk.
export const GET = withApiAuth(inventoryController.exportBalances, {
  feature: "INVENTORY",
  permission: "INVENTORY.VIEW",
});
