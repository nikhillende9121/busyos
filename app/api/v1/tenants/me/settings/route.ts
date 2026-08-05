import { tenantController } from "@/modules/tenant/controller/tenant.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const PUT = withApiAuth(tenantController.updateSettings, {
  permission: "TENANT.UPDATE_SETTINGS",
});
