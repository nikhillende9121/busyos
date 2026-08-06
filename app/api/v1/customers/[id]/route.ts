import { customerController } from "@/modules/customer/controller/customer.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(customerController.getById, {
  feature: "CUSTOMER",
  permission: "CUSTOMER.VIEW",
});

export const PUT = withApiAuth<Params>(customerController.update, {
  feature: "CUSTOMER",
  permission: "CUSTOMER.UPDATE",
});

export const DELETE = withApiAuth<Params>(customerController.remove, {
  feature: "CUSTOMER",
  permission: "CUSTOMER.DELETE",
});
