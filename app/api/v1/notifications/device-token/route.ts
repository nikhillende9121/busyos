import { notificationController } from "@/modules/notification/controller/notification.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const POST = withApiAuth(notificationController.registerDeviceToken);
export const DELETE = withApiAuth(notificationController.unregisterDeviceToken);
