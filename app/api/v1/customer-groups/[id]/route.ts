import { customerGroupController } from "@/modules/pricing/controller/customer-group.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(customerGroupController.getById, {
  feature: "CUSTOMER_GROUP",
  permission: "CUSTOMER_GROUP.VIEW",
});

export const PUT = withApiAuth<Params>(customerGroupController.update, {
  feature: "CUSTOMER_GROUP",
  permission: "CUSTOMER_GROUP.UPDATE",
});

export const DELETE = withApiAuth<Params>(customerGroupController.remove, {
  feature: "CUSTOMER_GROUP",
  permission: "CUSTOMER_GROUP.DELETE",
});
