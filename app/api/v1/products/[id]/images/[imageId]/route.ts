import { productImageController } from "@/modules/product/controller/product-image.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string; imageId: string };

export const DELETE = withApiAuth<Params>(productImageController.remove, {
  feature: "PRODUCT",
  permission: "PRODUCT.UPDATE",
});

export const PATCH = withApiAuth<Params>(productImageController.makePrimary, {
  feature: "PRODUCT",
  permission: "PRODUCT.UPDATE",
});
