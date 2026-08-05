import { productController } from "@/modules/product/controller/product.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(productController.list, {
  feature: "PRODUCT",
  permission: "PRODUCT.VIEW",
});

export const POST = withApiAuth(productController.create, {
  feature: "PRODUCT",
  permission: "PRODUCT.CREATE",
});
