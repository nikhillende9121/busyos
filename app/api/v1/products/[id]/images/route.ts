import { productImageController } from "@/modules/product/controller/product-image.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const POST = withApiAuth<Params>(productImageController.upload, {
  feature: "PRODUCT",
  permission: "PRODUCT.UPDATE",
});
