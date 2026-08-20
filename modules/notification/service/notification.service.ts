import { getFirebaseMessaging } from "@/shared/utils/firebase-admin";
import { notificationRepository } from "../repository/notification.repository";
import type {
  NotificationView,
  RegisterDeviceTokenPayload,
  UnregisterDeviceTokenPayload,
  SendPushNotificationOptions,
  NotificationListParams,
} from "../types/notification.types";
import type { Notification } from "@prisma/client";

export const notificationService = {
  async registerDeviceToken(payload: RegisterDeviceTokenPayload): Promise<void> {
    await notificationRepository.upsertDeviceToken(payload);
  },

  async unregisterDeviceToken(payload: UnregisterDeviceTokenPayload): Promise<void> {
    await notificationRepository.deactivateDeviceToken(
      payload.tenantId,
      payload.userId,
      payload.fcmToken
    );
  },

  async sendToUsers(options: SendPushNotificationOptions): Promise<void> {
    const { tenantId, userIds, title, message, type = "GENERAL", data = {} } = options;
    if (userIds.length === 0) return;

    // 1. Create DB notifications for all target users
    const dbRecords = userIds.map((userId) => ({
      tenantId,
      userId,
      title,
      message,
      type,
      data: data as Record<string, unknown>,
      isRead: false,
    }));
    await notificationRepository.createManyNotifications(dbRecords);

    // 2. Fetch active FCM tokens for these users
    const fcmTokens = await notificationRepository.findActiveTokensForUsers(tenantId, userIds);
    if (fcmTokens.length === 0) return;

    // 3. Dispatch FCM push notifications via Firebase Admin SDK
    const messaging = getFirebaseMessaging();
    if (!messaging) return; // Credentials not set, skip FCM dispatch safely

    try {
      const response = await messaging.sendEachForMulticast({
        tokens: fcmTokens,
        notification: {
          title,
          body: message,
        },
        data: {
          title,
          message,
          type,
          ...data,
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
          },
        },
      });

      // 4. Handle stale/invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
            if (
              errCode === "messaging/registration-token-not-registered" ||
              errCode === "messaging/invalid-registration-token"
            ) {
              const token = fcmTokens[idx];
              if (token) invalidTokens.push(token);
            }
          }
        });

        if (invalidTokens.length > 0) {
          await notificationRepository.deactivateTokensByFcmTokens(invalidTokens);
        }
      }
    } catch (error) {
      console.error("[NotificationService] Error sending FCM multicast push:", error);
    }
  },

  async sendToWarehouse(options: {
    tenantId: bigint;
    warehouseId?: bigint;
    title: string;
    message: string;
    type?: string;
    data?: Record<string, string>;
  }): Promise<void> {
    const userIds = await notificationRepository.findUserIdsForWarehouse(
      options.tenantId,
      options.warehouseId
    );
    await this.sendToUsers({
      tenantId: options.tenantId,
      userIds,
      title: options.title,
      message: options.message,
      type: options.type,
      data: options.data,
    });
  },

  async list(params: NotificationListParams) {
    const { items, total } = await notificationRepository.findManyByTenantAndUser(params);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    return {
      items: items.map(toNotificationView),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  },

  async getUnreadCount(tenantId: bigint, userId: bigint): Promise<number> {
    return notificationRepository.countUnread(tenantId, userId);
  },

  async markAsRead(tenantId: bigint, userId: bigint, notificationId: bigint): Promise<void> {
    await notificationRepository.markAsRead(tenantId, userId, notificationId);
  },

  async markAllAsRead(tenantId: bigint, userId: bigint): Promise<void> {
    await notificationRepository.markAllAsRead(tenantId, userId);
  },
};

function toNotificationView(notification: Notification): NotificationView {
  return {
    id: notification.id.toString(),
    tenantId: notification.tenantId.toString(),
    userId: notification.userId.toString(),
    title: notification.title,
    message: notification.message,
    type: notification.type,
    data: (notification.data as Record<string, unknown>) ?? null,
    isRead: notification.isRead,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
  };
}
