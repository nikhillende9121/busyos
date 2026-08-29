import { couponController } from "@/modules/pricing/controller/coupon.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Same permission as the list route — exporting is still just viewing,
// in bulk.
export const GET = withApiAuth(couponController.exportList, {
  feature: "COUPON",
  permission: "COUPON.VIEW",
});
