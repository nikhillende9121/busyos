import { extraChargeController } from "@/modules/extra-charge/controller/extra-charge.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Configuration route for extra charges (shipping/handling/fees).
export const GET = withApiAuth(extraChargeController.list, {
  permission: "EXTRA_CHARGE.VIEW",
});

export const POST = withApiAuth(extraChargeController.create, {
  permission: "EXTRA_CHARGE.CREATE",
});
