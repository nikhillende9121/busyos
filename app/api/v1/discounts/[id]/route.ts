import { discountController } from "@/modules/pricing/controller/discount.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(discountController.getById, {
  feature: "DISCOUNT",
  permission: "DISCOUNT.VIEW",
});
