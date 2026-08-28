import { saleReturnController } from "@/modules/sales/controller/sale-return.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Read-only preview (no writes) — gated by VIEW, same reasoning as
// POST /pricing/quote: "check what a return would refund," not its own
// resource creation.
export const POST = withApiAuth(saleReturnController.quote, {
  feature: "SALE_RETURN",
  permission: "SALE_RETURN.VIEW",
});
