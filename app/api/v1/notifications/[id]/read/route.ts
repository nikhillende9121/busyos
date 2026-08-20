import { notificationController } from "@/modules/notification/controller/notification.controller";
import { withApiAuth } from "@/shared/middleware/with-api-auth";

export const PATCH = withApiAuth<{ id: string }>(notificationController.markAsRead);
