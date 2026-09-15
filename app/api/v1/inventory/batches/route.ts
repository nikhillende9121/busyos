import { productBatchController } from "@/modules/inventory/controller/product-batch.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(productBatchController.list, {
  feature: "BATCH_TRACKING",
  permission: "INVENTORY.VIEW",
});
