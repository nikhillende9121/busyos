import { priceListController } from "@/modules/pricing/controller/price-list.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(priceListController.list, {
  feature: "SALES",
  permission: "PRICE_LIST.VIEW",
});

export const POST = withApiAuth(priceListController.create, {
  feature: "SALES",
  permission: "PRICE_LIST.CREATE",
});
