import type { NextRequest } from "next/server";
import {
  registerDeviceTokenSchema,
  unregisterDeviceTokenSchema,
  listNotificationsQuerySchema,
} from "../schema/notification.schema";
import { notificationService } from "../service/notification.service";
import { successResponse } from "@/shared/utils/api-response";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { idString } from "@/shared/validation/id";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

type NotificationParams = { id: string };

export const notificationController = {
  async registerDeviceToken(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = registerDeviceTokenSchema.parse(body);

      await notificationService.registerDeviceToken({
        tenantId: auth.tenantId,
        userId: auth.userId,
        deviceId: input.deviceId,
        fcmToken: input.fcmToken,
        platform: input.platform,
        deviceModel: input.deviceModel,
      });

      return successResponse({ registered: true }, "Device token registered successfully");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async unregisterDeviceToken(request: NextRequest, auth: AuthContext) {
    try {
      const body = await request.json();
      const input = unregisterDeviceTokenSchema.parse(body);

      await notificationService.unregisterDeviceToken({
        tenantId: auth.tenantId,
        userId: auth.userId,
        fcmToken: input.fcmToken,
      });

      return successResponse({ unregistered: true }, "Device token unregistered successfully");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async list(request: NextRequest, auth: AuthContext) {
    try {
      const searchParams = Object.fromEntries(request.nextUrl.searchParams);
      const query = listNotificationsQuerySchema.parse(searchParams);

      const result = await notificationService.list({
        tenantId: auth.tenantId,
        userId: auth.userId,
        page: query.page,
        pageSize: query.pageSize,
        unreadOnly: query.unreadOnly,
      });

      return successResponse(result, "Notifications retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async getUnreadCount(_request: NextRequest, auth: AuthContext) {
    try {
      const unreadCount = await notificationService.getUnreadCount(auth.tenantId, auth.userId);
      return successResponse({ unreadCount }, "Unread notification count retrieved");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async markAsRead(_request: NextRequest, auth: AuthContext, params: NotificationParams) {
    try {
      const id = idString.parse(params.id);
      await notificationService.markAsRead(auth.tenantId, auth.userId, BigInt(id));
      return successResponse(null, "Notification marked as read");
    } catch (error) {
      return handleRouteError(error);
    }
  },

  async markAllAsRead(_request: NextRequest, auth: AuthContext) {
    try {
      await notificationService.markAllAsRead(auth.tenantId, auth.userId);
      return successResponse(null, "All notifications marked as read");
    } catch (error) {
      return handleRouteError(error);
    }
  },
};
