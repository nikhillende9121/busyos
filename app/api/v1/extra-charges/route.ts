import { extraChargeController } from "@/modules/extra-charge/controller/extra-charge.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Configuration route for extra charges (shipping/handling/fees).
export const GET = withApiAuth(extraChargeController.list, {
  feature: "EXTRA_CHARGE",
  permission: "EXTRA_CHARGE.VIEW",
});

export const POST = withApiAuth(extraChargeController.create, {
  feature: "EXTRA_CHARGE",
  permission: "EXTRA_CHARGE.CREATE",
});
