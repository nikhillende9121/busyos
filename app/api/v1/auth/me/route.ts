import { authController } from "@/modules/auth/controller/auth.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(authController.me);
