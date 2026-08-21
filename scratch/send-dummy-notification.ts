import "dotenv/config";
import { prisma } from "@/shared/database/prisma";
import { notificationService } from "@/modules/notification/service/notification.service";

async function main() {
  console.log("Fetching first active user from DB...");
  const user = await prisma.user.findFirst({
    where: { status: "ACTIVE", deletedAt: null },
    select: { id: true, tenantId: true, email: true, name: true },
  });

  if (!user) {
    console.error("No active user found in database!");
    return;
  }

  console.log(`Sending dummy notification to User [ID: ${user.id}, Email: ${user.email}, Tenant: ${user.tenantId}]...`);

  await notificationService.sendToUsers({
    tenantId: user.tenantId,
    userIds: [user.id],
    title: "🎉 Test Notification",
    message: "This is a dummy test notification sent from the inventory management system!",
    type: "TEST",
    data: {
      action: "TEST_DUMMY",
      timestamp: new Date().toISOString(),
    },
  });

  console.log("✅ Dummy notification dispatch completed!");

  // Check the notification record created in DB
  const latestNotif = await prisma.notification.findFirst({
    where: { tenantId: user.tenantId, userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  console.log("Latest DB Notification Record:", latestNotif);

  // Check active user devices
  const devices = await prisma.userDevice.findMany({
    where: { userId: user.id },
  });
  console.log(`User has ${devices.length} registered device(s):`, devices);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
