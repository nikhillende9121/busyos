import { couponController } from "@/modules/pricing/controller/coupon.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(couponController.getById, {
  feature: "COUPON",
  permission: "COUPON.VIEW",
});
