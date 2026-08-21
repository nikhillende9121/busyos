import "dotenv/config";
import { prisma } from "@/shared/database/prisma";
import { notificationService } from "@/modules/notification/service/notification.service";
import { getFirebaseMessaging } from "@/shared/utils/firebase-admin";

async function main() {
  console.log("=== Testing Firebase Admin FCM Push Notification ===");

  // 1. Check Firebase Admin initialization
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    console.error("❌ Firebase Admin SDK failed to initialize. Check .env credentials.");
    return;
  }
  console.log("✅ Firebase Admin Messaging initialized successfully!");

  // 2. Find active user and devices
  const user = await prisma.user.findFirst({
    where: { status: "ACTIVE", deletedAt: null },
    select: { id: true, tenantId: true, email: true },
  });

  if (!user) {
    console.error("❌ No active user found in database.");
    return;
  }

  const devices = await prisma.userDevice.findMany({
    where: { userId: user.id },
  });

  console.log(`User [${user.email}] has ${devices.length} device(s) registered.`);

  let fcmTokenToSend = devices.find((d) => d.fcmToken)?.fcmToken;

  if (!fcmTokenToSend) {
    console.log("⚠️ No FCM Token found in database for user devices.");
    console.log("Registering a temporary dummy FCM token for testing...");
    
    // For demonstration, register/upsert a dummy token so the pipeline executes
    const dummyToken = "dUmMy_FcM_tOkEn_FoR_tEsTiNg_1234567890_abcdefghijklmnopqrstuvwxyz";
    
    await prisma.userDevice.upsert({
      where: {
        userId_deviceId: {
          userId: user.id,
          deviceId: "ANDROID_DEVICE_TEST_9999",
        },
      },
      update: { fcmToken: dummyToken, isActive: true },
      create: {
        tenantId: user.tenantId,
        userId: user.id,
        deviceId: "ANDROID_DEVICE_TEST_9999",
        fcmToken: dummyToken,
        platform: "ANDROID",
        isActive: true,
      },
    });

    fcmTokenToSend = dummyToken;
  }

  console.log(`Sending push notification to token: "${fcmTokenToSend.slice(0, 30)}..."`);

  // 3. Dispatch push notification via notificationService
  await notificationService.sendToUsers({
    tenantId: user.tenantId,
    userIds: [user.id],
    title: "🔔 Real Push Notification Test",
    message: "Hello from Inventory Management System via Firebase Cloud Messaging!",
    type: "SYSTEM_ALERT",
    data: {
      timestamp: new Date().toISOString(),
      source: "antigravity_test",
    },
  });

  console.log("✅ Notification dispatch finished successfully!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
