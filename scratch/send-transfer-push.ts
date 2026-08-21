import "dotenv/config";
import { prisma } from "@/shared/database/prisma";
import { notificationService } from "@/modules/notification/service/notification.service";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "shop1@pista.com" },
    select: { id: true, tenantId: true },
  });
  if (!user) return console.error("user not found");

  console.log("Sending STOCK_TRANSFER push (mirrors stock-transfer.service.ts)...");
  await notificationService.sendToUsers({
    tenantId: user.tenantId,
    userIds: [user.id],
    title: "Stock Transfer Shipped",
    message: "Transfer #19 is on its way to your warehouse.",
    type: "STOCK_TRANSFER",
    data: { entityId: "19", route: "STOCK_TRANSFER_DETAIL" },
  });
  console.log("Dispatch call completed.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
