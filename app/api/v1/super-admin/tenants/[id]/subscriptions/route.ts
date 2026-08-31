import { superAdminSubscriptionController } from "@/modules/super-admin/controller/subscription.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

type Params = { id: string };

export const GET = withSuperAdminAuth<Params>(superAdminSubscriptionController.list);
export const POST = withSuperAdminAuth<Params>(superAdminSubscriptionController.create);
