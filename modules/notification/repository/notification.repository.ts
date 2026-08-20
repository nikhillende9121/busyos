import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

export const notificationRepository = {
  // Device Token Operations
  async upsertDeviceToken(data: {
    tenantId: bigint;
    userId: bigint;
    deviceId: string;
    fcmToken: string;
    platform?: string;
    deviceModel?: string;
  }) {
    return prisma.userDevice.upsert({
      where: {
        userId_deviceId: {
          userId: data.userId,
          deviceId: data.deviceId,
        },
      },
      update: {
        fcmToken: data.fcmToken,
        platform: data.platform ?? "ANDROID",
        deviceModel: data.deviceModel,
        isActive: true,
        lastLoginAt: new Date(),
      },
      create: {
        tenantId: data.tenantId,
        userId: data.userId,
        deviceId: data.deviceId,
        fcmToken: data.fcmToken,
        platform: data.platform ?? "ANDROID",
        deviceModel: data.deviceModel,
        isActive: true,
        lastLoginAt: new Date(),
      },
    });
  },

  async deactivateDeviceToken(tenantId: bigint, userId: bigint, fcmToken: string) {
    return prisma.userDevice.updateMany({
      where: { tenantId, userId, fcmToken },
      data: { isActive: false },
    });
  },

  async deactivateTokensByFcmTokens(fcmTokens: string[]) {
    if (fcmTokens.length === 0) return;
    return prisma.userDevice.updateMany({
      where: { fcmToken: { in: fcmTokens } },
      data: { isActive: false },
    });
  },

  async findActiveTokensForUsers(tenantId: bigint, userIds: bigint[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const devices = await prisma.userDevice.findMany({
      where: {
        tenantId,
        userId: { in: userIds },
        isActive: true,
        fcmToken: { not: null },
      },
      select: { fcmToken: true },
    });
    return devices.map((d) => d.fcmToken!).filter((t): t is string => Boolean(t));
  },

  async findUserIdsForWarehouse(tenantId: bigint, warehouseId?: bigint): Promise<bigint[]> {
    const whereCondition: Prisma.UserWhereInput = {
      tenantId,
      status: "ACTIVE",
      deletedAt: null,
    };

    if (warehouseId !== undefined) {
      // Find users assigned specifically to this warehouse OR unrestricted users (warehouseId == null)
      whereCondition.OR = [
        { warehouseId },
        { warehouseId: null },
      ];
    }

    const users = await prisma.user.findMany({
      where: whereCondition,
      select: { id: true },
    });
    return users.map((u) => u.id);
  },

  // Notification Feed Operations
  async createNotification(data: Prisma.NotificationUncheckedCreateInput) {
    return prisma.notification.create({ data });
  },

  async createManyNotifications(data: Prisma.NotificationUncheckedCreateInput[]) {
    if (data.length === 0) return;
    return prisma.notification.createMany({ data });
  },

  async findManyByTenantAndUser(params: {
    tenantId: bigint;
    userId: bigint;
    page: number;
    pageSize: number;
    unreadOnly?: boolean;
  }) {
    const { tenantId, userId, page, pageSize, unreadOnly } = params;
    const where: Prisma.NotificationWhereInput = {
      tenantId,
      userId,
      ...(unreadOnly ? { isRead: false } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.count({ where }),
    ]);

    return { items, total };
  },

  async countUnread(tenantId: bigint, userId: bigint): Promise<number> {
    return prisma.notification.count({
      where: { tenantId, userId, isRead: false },
    });
  },

  async markAsRead(tenantId: bigint, userId: bigint, notificationId: bigint) {
    return prisma.notification.updateMany({
      where: { id: notificationId, tenantId, userId },
      data: { isRead: true, readAt: new Date() },
    });
  },

  async markAllAsRead(tenantId: bigint, userId: bigint) {
    return prisma.notification.updateMany({
      where: { tenantId, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  },
};
