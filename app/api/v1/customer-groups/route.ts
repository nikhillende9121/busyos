import { customerGroupController } from "@/modules/pricing/controller/customer-group.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(customerGroupController.list, {
  feature: "CUSTOMER_GROUP",
  permission: "CUSTOMER_GROUP.VIEW",
});

export const POST = withApiAuth(customerGroupController.create, {
  feature: "CUSTOMER_GROUP",
  permission: "CUSTOMER_GROUP.CREATE",
});
