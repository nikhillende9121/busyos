import { categoryController } from "@/modules/product/controller/category.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(categoryController.list, {
  feature: "PRODUCT",
  permission: "CATEGORY.VIEW",
});

export const POST = withApiAuth(categoryController.create, {
  feature: "PRODUCT",
  permission: "CATEGORY.CREATE",
});
