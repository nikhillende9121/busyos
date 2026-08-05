import { brandController } from "@/modules/product/controller/brand.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(brandController.list, {
  feature: "PRODUCT",
  permission: "BRAND.VIEW",
});

export const POST = withApiAuth(brandController.create, {
  feature: "PRODUCT",
  permission: "BRAND.CREATE",
});
