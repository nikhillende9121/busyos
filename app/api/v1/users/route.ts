import { userController } from "@/modules/user/controller/user.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

// No `feature` gate: same reasoning as roles/route.ts.
export const GET = withApiAuth(userController.list, {
  permission: "USER.VIEW",
});

export const POST = withApiAuth(userController.create, {
  permission: "USER.CREATE",
});
