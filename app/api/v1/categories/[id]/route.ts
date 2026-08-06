import { categoryController } from "@/modules/product/controller/category.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(categoryController.getById, {
  feature: "CATEGORY",
  permission: "CATEGORY.VIEW",
});

export const PUT = withApiAuth<Params>(categoryController.update, {
  feature: "CATEGORY",
  permission: "CATEGORY.UPDATE",
});

export const DELETE = withApiAuth<Params>(categoryController.remove, {
  feature: "CATEGORY",
  permission: "CATEGORY.DELETE",
});
