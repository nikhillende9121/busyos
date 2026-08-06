import { brandController } from "@/modules/product/controller/brand.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(brandController.getById, {
  feature: "BRAND",
  permission: "BRAND.VIEW",
});

export const PUT = withApiAuth<Params>(brandController.update, {
  feature: "BRAND",
  permission: "BRAND.UPDATE",
});

export const DELETE = withApiAuth<Params>(brandController.remove, {
  feature: "BRAND",
  permission: "BRAND.DELETE",
});
