import { superAdminPlanController } from "@/modules/super-admin/controller/plan.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

export const GET = withSuperAdminAuth(superAdminPlanController.list);
export const POST = withSuperAdminAuth(superAdminPlanController.create);
