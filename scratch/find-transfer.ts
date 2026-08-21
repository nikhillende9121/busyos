import "dotenv/config";
import { prisma } from "@/shared/database/prisma";

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "shop1@pista.com" },
    select: { id: true, tenantId: true },
  });
  if (!user) return console.error("user not found");

  const transfer = await prisma.stockTransfer.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, toWarehouseId: true, fromWarehouseId: true },
  });
  console.log("user:", user);
  console.log("latest transfer:", transfer ? { ...transfer, id: transfer.id.toString() } : null);
}

main().catch(console.error).finally(() => prisma.$disconnect());
