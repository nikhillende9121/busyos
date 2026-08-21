import "dotenv/config";
import { prisma } from "@/shared/database/prisma";

async function main() {
  const devices = await prisma.userDevice.findMany({
    include: { user: { select: { email: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  console.log(`Found ${devices.length} device row(s):`);
  for (const d of devices) {
    console.log({
      id: d.id.toString(),
      userEmail: d.user.email,
      deviceId: d.deviceId,
      fcmTokenPreview: d.fcmToken ? d.fcmToken.slice(0, 25) + "..." : null,
      platform: d.platform,
      deviceModel: d.deviceModel,
      isActive: d.isActive,
      updatedAt: d.updatedAt,
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
