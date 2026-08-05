import { unitController } from "@/modules/product/controller/unit.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(unitController.list, {
  feature: "PRODUCT",
  permission: "UNIT.VIEW",
});

export const POST = withApiAuth(unitController.create, {
  feature: "PRODUCT",
  permission: "UNIT.CREATE",
});
