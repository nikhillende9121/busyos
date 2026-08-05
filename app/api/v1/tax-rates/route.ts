import { taxRateController } from "@/modules/tax-rate/controller/tax-rate.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// No `feature` gate: taxation is a core configuration concern, not a
// plan-gated add-on — same reasoning as modules/warehouse's routes.
export const GET = withApiAuth(taxRateController.list, {
  permission: "TAX_RATE.VIEW",
});

export const POST = withApiAuth(taxRateController.create, {
  permission: "TAX_RATE.CREATE",
});
