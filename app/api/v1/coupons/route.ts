import { couponController } from "@/modules/pricing/controller/coupon.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(couponController.list, {
  feature: "SALES",
  permission: "COUPON.VIEW",
});

export const POST = withApiAuth(couponController.create, {
  feature: "SALES",
  permission: "COUPON.CREATE",
});
