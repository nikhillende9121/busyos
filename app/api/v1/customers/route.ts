import { customerController } from "@/modules/customer/controller/customer.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(customerController.list, {
  feature: "SALES",
  permission: "CUSTOMER.VIEW",
});

export const POST = withApiAuth(customerController.create, {
  feature: "SALES",
  permission: "CUSTOMER.CREATE",
});
