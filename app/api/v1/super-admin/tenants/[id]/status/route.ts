import { superAdminTenantController } from "@/modules/super-admin/controller/tenant.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

type Params = { id: string };

export const PUT = withSuperAdminAuth<Params>(superAdminTenantController.updateStatus);
