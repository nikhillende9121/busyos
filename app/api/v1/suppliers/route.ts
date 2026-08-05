import { supplierController } from "@/modules/supplier/controller/supplier.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(supplierController.list, {
  feature: "PURCHASE",
  permission: "SUPPLIER.VIEW",
});

export const POST = withApiAuth(supplierController.create, {
  feature: "PURCHASE",
  permission: "SUPPLIER.CREATE",
});
