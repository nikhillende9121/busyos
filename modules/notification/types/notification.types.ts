export interface NotificationView {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface RegisterDeviceTokenPayload {
  tenantId: bigint;
  userId: bigint;
  deviceId: string;
  fcmToken: string;
  platform?: string;
  deviceModel?: string;
}

export interface UnregisterDeviceTokenPayload {
  tenantId: bigint;
  userId: bigint;
  fcmToken: string;
}

export interface CreateNotificationPayload {
  tenantId: bigint;
  userId: bigint;
  title: string;
  message: string;
  type?: string;
  data?: Record<string, unknown>;
}

export interface SendPushNotificationOptions {
  tenantId: bigint;
  userIds: bigint[];
  title: string;
  message: string;
  type?: string;
  data?: Record<string, string>;
}

export interface NotificationListParams {
  tenantId: bigint;
  userId: bigint;
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}
