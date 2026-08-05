import { extraChargeController } from "@/modules/extra-charge/controller/extra-charge.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// No `feature` gate — same reasoning as tax-rates: configuration, not a
// plan-gated add-on.
export const GET = withApiAuth(extraChargeController.list, {
  permission: "EXTRA_CHARGE.VIEW",
});

export const POST = withApiAuth(extraChargeController.create, {
  permission: "EXTRA_CHARGE.CREATE",
});
