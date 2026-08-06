import { discountController } from "@/modules/pricing/controller/discount.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(discountController.list, {
  feature: "DISCOUNT",
  permission: "DISCOUNT.VIEW",
});

export const POST = withApiAuth(discountController.create, {
  feature: "DISCOUNT",
  permission: "DISCOUNT.CREATE",
});
