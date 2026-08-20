import { notificationController } from "@/modules/notification/controller/notification.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const GET = withApiAuth(notificationController.list);
