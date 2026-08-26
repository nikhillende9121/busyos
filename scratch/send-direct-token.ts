import "dotenv/config";
import { prisma } from "@/shared/database/prisma";
import { getFirebaseMessaging } from "@/shared/utils/firebase-admin";

async function main() {
  const device = await prisma.userDevice.findUnique({ where: { id: 5n } });
  if (!device?.fcmToken) return console.error("no token on row 5");

  const messaging = getFirebaseMessaging();
  if (!messaging) return console.error("firebase admin not configured");

  const response = await messaging.sendEachForMulticast({
    tokens: [device.fcmToken],
    data: {
      title: "Icon Fix Test",
      message: "If the bag icon and blue badge look right, this worked.",
      type: "STOCK_TRANSFER",
      entityId: "19",
      route: "STOCK_TRANSFER_DETAIL",
    },
    android: { priority: "high" },
  });
  console.log(JSON.stringify(response, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
