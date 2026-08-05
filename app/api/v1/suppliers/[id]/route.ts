import { supplierController } from "@/modules/supplier/controller/supplier.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(supplierController.getById, {
  feature: "PURCHASE",
  permission: "SUPPLIER.VIEW",
});

export const PUT = withApiAuth<Params>(supplierController.update, {
  feature: "PURCHASE",
  permission: "SUPPLIER.UPDATE",
});

export const DELETE = withApiAuth<Params>(supplierController.remove, {
  feature: "PURCHASE",
  permission: "SUPPLIER.DELETE",
});
