import { superAdminPlanController } from "@/modules/super-admin/controller/plan.controller";
import { withSuperAdminAuth } from "@/shared/middleware/with-super-admin-auth";

type Params = { id: string };

export const PUT = withSuperAdminAuth<Params>(superAdminPlanController.update);
