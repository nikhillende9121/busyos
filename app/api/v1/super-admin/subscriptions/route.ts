import { superAdminSubscriptionController } from "@/modules/super-admin/controller/subscription.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

export const GET = withSuperAdminAuth(superAdminSubscriptionController.listAll);
