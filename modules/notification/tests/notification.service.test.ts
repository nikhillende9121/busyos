import { describe, it, expect, vi, beforeEach } from "vitest";
import { notificationService } from "../service/notification.service";
import { notificationRepository } from "../repository/notification.repository";

vi.mock("../repository/notification.repository", () => ({
  notificationRepository: {
    upsertDeviceToken: vi.fn(),
    deactivateDeviceToken: vi.fn(),
    deactivateTokensByFcmTokens: vi.fn(),
    findActiveTokensForUsers: vi.fn(),
    findUserIdsForWarehouse: vi.fn(),
    createNotification: vi.fn(),
    createManyNotifications: vi.fn(),
    findManyByTenantAndUser: vi.fn(),
    countUnread: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  },
}));

vi.mock("@/shared/utils/firebase-admin", () => ({
  getFirebaseMessaging: vi.fn().mockReturnValue(null),
}));

describe("notificationService", () => {
  const tenantId = 1n;
  const userId = 2n;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a device token", async () => {
    vi.mocked(notificationRepository.upsertDeviceToken).mockResolvedValue({} as never);

    await notificationService.registerDeviceToken({
      tenantId,
      userId,
      deviceId: "dev_123",
      fcmToken: "token_abc",
      platform: "ANDROID",
    });

    expect(notificationRepository.upsertDeviceToken).toHaveBeenCalledWith({
      tenantId,
      userId,
      deviceId: "dev_123",
      fcmToken: "token_abc",
      platform: "ANDROID",
    });
  });

  it("unregisters a device token", async () => {
    vi.mocked(notificationRepository.deactivateDeviceToken).mockResolvedValue({ count: 1 });

    await notificationService.unregisterDeviceToken({
      tenantId,
      userId,
      fcmToken: "token_abc",
    });

    expect(notificationRepository.deactivateDeviceToken).toHaveBeenCalledWith(
      tenantId,
      userId,
      "token_abc"
    );
  });

  it("sends notifications to multiple users and handles database persistence", async () => {
    vi.mocked(notificationRepository.createManyNotifications).mockResolvedValue(undefined as never);
    vi.mocked(notificationRepository.findActiveTokensForUsers).mockResolvedValue([]);

    await notificationService.sendToUsers({
      tenantId,
      userIds: [userId, 3n],
      title: "Test Alert",
      message: "Low stock detected",
      type: "LOW_STOCK",
      data: { productId: "10" },
    });

    expect(notificationRepository.createManyNotifications).toHaveBeenCalledWith([
      {
        tenantId,
        userId: 2n,
        title: "Test Alert",
        message: "Low stock detected",
        type: "LOW_STOCK",
        data: { productId: "10" },
        isRead: false,
      },
      {
        tenantId,
        userId: 3n,
        title: "Test Alert",
        message: "Low stock detected",
        type: "LOW_STOCK",
        data: { productId: "10" },
        isRead: false,
      },
    ]);
  });

  it("fetches paginated notifications list for user", async () => {
    const mockNotifications = [
      {
        id: 10n,
        tenantId,
        userId,
        title: "Stock Received",
        message: "Transfer completed",
        type: "STOCK_TRANSFER",
        data: { transferId: "5" },
        isRead: false,
        readAt: null,
        createdAt: new Date("2026-08-20T12:00:00Z"),
      },
    ];

    vi.mocked(notificationRepository.findManyByTenantAndUser).mockResolvedValue({
      items: mockNotifications as never,
      total: 1,
    });

    const result = await notificationService.list({
      tenantId,
      userId,
      page: 1,
      pageSize: 20,
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].id).toBe("10");
    expect(result.items[0].title).toBe("Stock Received");
    expect(result.pagination.total).toBe(1);
  });

  it("returns unread count", async () => {
    vi.mocked(notificationRepository.countUnread).mockResolvedValue(5);

    const count = await notificationService.getUnreadCount(tenantId, userId);
    expect(count).toBe(5);
    expect(notificationRepository.countUnread).toHaveBeenCalledWith(tenantId, userId);
  });

  it("marks notification as read", async () => {
    vi.mocked(notificationRepository.markAsRead).mockResolvedValue({ count: 1 });

    await notificationService.markAsRead(tenantId, userId, 10n);
    expect(notificationRepository.markAsRead).toHaveBeenCalledWith(tenantId, userId, 10n);
  });
});
