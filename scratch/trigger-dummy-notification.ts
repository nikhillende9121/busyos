import "dotenv/config";
import { prisma } from "@/shared/database/prisma";
import { notificationService } from "@/modules/notification/service/notification.service";

async function main() {
  const timeStr = new Date().toLocaleTimeString();

  const user = await prisma.user.findFirst({
    where: { status: "ACTIVE", deletedAt: null },
    select: { id: true, tenantId: true, email: true },
  });

  if (!user) {
    console.error("No active user found.");
    return;
  }

  console.log(`Sending fresh dummy notification to User [${user.email}] at ${timeStr}...`);

  await notificationService.sendToUsers({
    tenantId: user.tenantId,
    userIds: [user.id],
    title: "🔔 Dummy Push Notification",
    message: `Test notification sent successfully at ${timeStr}!`,
    type: "TEST_ALERT",
    data: {
      timestamp: new Date().toISOString(),
      status: "SUCCESS",
    },
  });

  const latestNotif = await prisma.notification.findFirst({
    where: { tenantId: user.tenantId, userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  console.log("Created Notification Record:", {
    id: latestNotif?.id.toString(),
    title: latestNotif?.title,
    message: latestNotif?.message,
    type: latestNotif?.type,
    createdAt: latestNotif?.createdAt,
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
