import { brandController } from "@/modules/product/controller/brand.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(brandController.list, {
  feature: "BRAND",
  permission: "BRAND.VIEW",
});

export const POST = withApiAuth(brandController.create, {
  feature: "BRAND",
  permission: "BRAND.CREATE",
});
