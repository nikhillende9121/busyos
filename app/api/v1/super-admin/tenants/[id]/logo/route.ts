import { superAdminTenantController } from "@/modules/super-admin/controller/tenant.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

type Params = { id: string };

export const POST = withSuperAdminAuth<Params>(superAdminTenantController.uploadLogo);

export const DELETE = withSuperAdminAuth<Params>(superAdminTenantController.removeLogo);
