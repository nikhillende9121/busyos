import { productController } from "@/modules/product/controller/product.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(productController.getById, {
  feature: "PRODUCT",
  permission: "PRODUCT.VIEW",
});

export const PUT = withApiAuth<Params>(productController.update, {
  feature: "PRODUCT",
  permission: "PRODUCT.UPDATE",
});

export const DELETE = withApiAuth<Params>(productController.remove, {
  feature: "PRODUCT",
  permission: "PRODUCT.DELETE",
});
