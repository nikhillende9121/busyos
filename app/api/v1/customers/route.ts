import { customerController } from "@/modules/customer/controller/customer.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(customerController.list, {
  feature: "CUSTOMER",
  permission: "CUSTOMER.VIEW",
});

export const POST = withApiAuth(customerController.create, {
  feature: "CUSTOMER",
  permission: "CUSTOMER.CREATE",
});
