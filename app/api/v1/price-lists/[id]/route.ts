import { priceListController } from "@/modules/pricing/controller/price-list.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(priceListController.getById, {
  feature: "PRICE_LIST",
  permission: "PRICE_LIST.VIEW",
});
