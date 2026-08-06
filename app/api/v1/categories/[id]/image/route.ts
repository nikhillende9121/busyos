import { categoryController } from "@/modules/product/controller/category.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const POST = withApiAuth<Params>(categoryController.uploadImage, {
  feature: "CATEGORY",
  permission: "CATEGORY.UPDATE",
});

export const DELETE = withApiAuth<Params>(categoryController.removeImage, {
  feature: "CATEGORY",
  permission: "CATEGORY.UPDATE",
});
