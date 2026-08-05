import { superAdminTenantController } from "@/modules/super-admin/controller/tenant.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

type Params = { id: string };

export const GET = withSuperAdminAuth<Params>(superAdminTenantController.getById);
