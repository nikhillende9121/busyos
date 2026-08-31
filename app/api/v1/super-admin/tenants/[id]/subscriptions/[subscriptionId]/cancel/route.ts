import { superAdminSubscriptionController } from "@/modules/super-admin/controller/subscription.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

type Params = { id: string; subscriptionId: string };

export const POST = withSuperAdminAuth<Params>(superAdminSubscriptionController.cancel);
