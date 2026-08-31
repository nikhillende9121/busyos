import { superAdminDashboardController } from "@/modules/super-admin/controller/dashboard.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

export const GET = withSuperAdminAuth(superAdminDashboardController.getDashboard);
