import { brandController } from "@/modules/product/controller/brand.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const POST = withApiAuth<Params>(brandController.uploadImage, {
  feature: "PRODUCT",
  permission: "BRAND.UPDATE",
});

export const DELETE = withApiAuth<Params>(brandController.removeImage, {
  feature: "PRODUCT",
  permission: "BRAND.UPDATE",
});
