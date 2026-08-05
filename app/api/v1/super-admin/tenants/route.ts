import { superAdminTenantController } from "@/modules/super-admin/controller/tenant.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

export const GET = withSuperAdminAuth(superAdminTenantController.list);
export const POST = withSuperAdminAuth(superAdminTenantController.create);
