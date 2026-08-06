import { promotionController } from "@/modules/pricing/controller/promotion.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Read-only preview (no writes, no coupon redemption) — gated by SALE.VIEW
// rather than a dedicated code, since it's "check pricing for a potential
// sale," not its own resource.
export const POST = withApiAuth(promotionController.quote, {
  feature: "PRICE_LIST",
  permission: "SALE.VIEW",
});
