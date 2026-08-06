import { priceListController } from "@/modules/pricing/controller/price-list.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(priceListController.list, {
  feature: "PRICE_LIST",
  permission: "PRICE_LIST.VIEW",
});

export const POST = withApiAuth(priceListController.create, {
  feature: "PRICE_LIST",
  permission: "PRICE_LIST.CREATE",
});
