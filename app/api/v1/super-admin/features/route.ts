import { superAdminFeatureController } from "@/modules/super-admin/controller/feature.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

export const GET = withSuperAdminAuth(superAdminFeatureController.list);
export const POST = withSuperAdminAuth(superAdminFeatureController.create);
