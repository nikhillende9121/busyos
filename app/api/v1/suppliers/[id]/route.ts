import { supplierController } from "@/modules/supplier/controller/supplier.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(supplierController.getById, {
  feature: "SUPPLIER",
  permission: "SUPPLIER.VIEW",
});

export const PUT = withApiAuth<Params>(supplierController.update, {
  feature: "SUPPLIER",
  permission: "SUPPLIER.UPDATE",
});

export const DELETE = withApiAuth<Params>(supplierController.remove, {
  feature: "SUPPLIER",
  permission: "SUPPLIER.DELETE",
});
