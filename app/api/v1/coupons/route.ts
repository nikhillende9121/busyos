import { couponController } from "@/modules/pricing/controller/coupon.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(couponController.list, {
  feature: "COUPON",
  permission: "COUPON.VIEW",
});

export const POST = withApiAuth(couponController.create, {
  feature: "COUPON",
  permission: "COUPON.CREATE",
});
