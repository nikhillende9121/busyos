import "dotenv/config";
import { prisma } from "@/shared/database/prisma";
import { notificationService } from "@/modules/notification/service/notification.service";

async function main() {
  const targetEmail = "shop1@pista.com";
  console.log(`Searching for user with email: "${targetEmail}"...`);

  const user = await prisma.user.findFirst({
    where: { email: targetEmail, deletedAt: null },
    select: { id: true, tenantId: true, email: true, name: true, status: true },
  });

  if (!user) {
    console.error(`❌ User with email "${targetEmail}" was not found in the database.`);
    
    // List available users to assist
    const availableUsers = await prisma.user.findMany({
      take: 10,
      where: { deletedAt: null },
      select: { id: true, email: true, name: true },
    });
    console.log("Available users in database:", availableUsers);
    return;
  }

  console.log(`Found User: [ID: ${user.id}, Name: ${user.name}, Email: ${user.email}, Tenant: ${user.tenantId}]`);

  // Check user devices
  const devices = await prisma.userDevice.findMany({
    where: { userId: user.id },
  });
  console.log(`User has ${devices.length} registered device(s):`, devices);

  console.log(`Dispatching notification to ${user.email}...`);

  await notificationService.sendToUsers({
    tenantId: user.tenantId,
    userIds: [user.id],
    title: "🔔 Targeted Notification",
    message: `Hello ${user.name || "User"}, this is a targeted notification sent directly to shop1@pista.com!`,
    type: "TARGETED_ALERT",
    data: {
      recipientEmail: user.email,
      timestamp: new Date().toISOString(),
    },
  });

  const latestNotif = await prisma.notification.findFirst({
    where: { tenantId: user.tenantId, userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  console.log("✅ Targeted Notification Dispatch Completed! Created record:", {
    id: latestNotif?.id.toString(),
    userId: latestNotif?.userId.toString(),
    title: latestNotif?.title,
    message: latestNotif?.message,
    type: latestNotif?.type,
    createdAt: latestNotif?.createdAt,
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
