import { tenantController } from "@/modules/tenant/controller/tenant.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(tenantController.getSubscription, {
  permission: "TENANT.VIEW",
});
