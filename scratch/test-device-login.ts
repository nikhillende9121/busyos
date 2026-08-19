import "dotenv/config";
import { authService } from "../modules/auth/service/auth.service";
import { prisma } from "../shared/database/prisma";

async function main() {
  console.log("Testing device login tracking...");
  const user = await prisma.user.findFirst({ where: { deletedAt: null } });
  if (!user) {
    console.error("No active user found in DB");
    return;
  }

  // Simulate Android app login with deviceId
  const deviceId = "ANDROID_DEVICE_TEST_9999";
  const userDevice = await prisma.userDevice.upsert({
    where: {
      userId_deviceId: {
        userId: user.id,
        deviceId,
      },
    },
    create: {
      tenantId: user.tenantId,
      userId: user.id,
      deviceId,
      lastLoginAt: new Date(),
    },
    update: {
      lastLoginAt: new Date(),
    },
  });

  console.log("Recorded UserDevice record successfully:", {
    id: userDevice.id.toString(),
    userId: userDevice.userId.toString(),
    tenantId: userDevice.tenantId.toString(),
    deviceId: userDevice.deviceId,
    lastLoginAt: userDevice.lastLoginAt,
  });
}

main().catch(console.error);
