import { categoryController } from "@/modules/product/controller/category.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(categoryController.getById, {
  feature: "PRODUCT",
  permission: "CATEGORY.VIEW",
});

export const PUT = withApiAuth<Params>(categoryController.update, {
  feature: "PRODUCT",
  permission: "CATEGORY.UPDATE",
});

export const DELETE = withApiAuth<Params>(categoryController.remove, {
  feature: "PRODUCT",
  permission: "CATEGORY.DELETE",
});
