import { productController } from "@/modules/product/controller/product.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Same permission as the list route — exporting is still just viewing,
// in bulk.
export const GET = withApiAuth(productController.exportList, {
  feature: "PRODUCT",
  permission: "PRODUCT.VIEW",
});
