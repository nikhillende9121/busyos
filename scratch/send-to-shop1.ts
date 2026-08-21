import "dotenv/config";
import { prisma } from "@/shared/database/prisma";
import { notificationService } from "@/modules/notification/service/notification.service";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "shop1@pista.com" },
    select: { id: true, tenantId: true, email: true },
  });
  if (!user) {
    console.error("shop1@pista.com not found");
    return;
  }

  console.log(`Sending dummy push to ${user.email}...`);
  await notificationService.sendToUsers({
    tenantId: user.tenantId,
    userIds: [user.id],
    title: "Dummy Test Push",
    message: "If you can see this on your phone, the FCM pipeline works end to end.",
    type: "TEST",
    data: { action: "TEST_DUMMY" },
  });
  console.log("Dispatch call completed.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
