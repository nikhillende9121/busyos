import { roleController } from "@/modules/role/controller/role.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

type Params = { id: string };

export const GET = withApiAuth<Params>(roleController.getById, {
  permission: "ROLE.VIEW",
});

export const PUT = withApiAuth<Params>(roleController.update, {
  permission: "ROLE.UPDATE",
});

export const DELETE = withApiAuth<Params>(roleController.remove, {
  permission: "ROLE.DELETE",
});
