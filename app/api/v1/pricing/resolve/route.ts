import { priceListController } from "@/modules/pricing/controller/price-list.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(priceListController.resolve, {
  feature: "PRICE_LIST",
  permission: "PRICE_LIST.VIEW",
});
