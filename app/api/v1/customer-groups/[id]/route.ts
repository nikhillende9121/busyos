import { customerGroupController } from "@/modules/pricing/controller/customer-group.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(customerGroupController.getById, {
  feature: "SALES",
  permission: "CUSTOMER_GROUP.VIEW",
});

export const PUT = withApiAuth<Params>(customerGroupController.update, {
  feature: "SALES",
  permission: "CUSTOMER_GROUP.UPDATE",
});

export const DELETE = withApiAuth<Params>(customerGroupController.remove, {
  feature: "SALES",
  permission: "CUSTOMER_GROUP.DELETE",
});
