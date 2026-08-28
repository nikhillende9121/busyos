import { saleExchangeController } from "@/modules/sales/controller/sale-exchange.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// Read-only preview (no writes) — gated by VIEW, same reasoning as
// POST /pricing/quote: "check what an exchange would settle to," not its
// own resource creation.
export const POST = withApiAuth(saleExchangeController.quote, {
  feature: "SALE_EXCHANGE",
  permission: "SALE_RETURN.VIEW",
});
