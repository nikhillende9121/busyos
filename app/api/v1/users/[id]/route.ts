import { userController } from "@/modules/user/controller/user.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(userController.getById, {
  permission: "USER.VIEW",
});

export const PUT = withApiAuth<Params>(userController.update, {
  permission: "USER.UPDATE",
});

export const DELETE = withApiAuth<Params>(userController.remove, {
  permission: "USER.DELETE",
});
