import { prisma } from "@/shared/database/prisma";
import { signAccessToken } from "@/shared/auth/jwt";

async function main() {
  const transfer = await prisma.stockTransfer.findUnique({ where: { id: 14n }, include: { items: true } });
  if (!transfer) { console.log("transfer 14 not found in DB at all"); return; }
  console.log("current state:", {
    id: transfer.id.toString(),
    tenantId: transfer.tenantId.toString(),
    status: transfer.status,
    items: transfer.items.map((i) => ({ id: i.id.toString(), shippedQuantity: i.shippedQuantity?.toString() ?? null, receivedQuantity: i.receivedQuantity?.toString() ?? null })),
  });

  const user = await prisma.user.findFirst({ where: { tenantId: transfer.tenantId, status: "ACTIVE" } });
  if (!user) { console.log("no active user for tenant", transfer.tenantId.toString()); return; }
  const token = signAccessToken({ sub: user.id.toString(), tenantId: user.tenantId.toString(), roleId: user.roleId.toString() });
  console.log("token payload tenantId:", user.tenantId.toString(), "correct transfer tenantId:", transfer.tenantId.toString());

  // Also test with a WRONG tenant token to reproduce the "not found" the user is seeing.
  const wrongTenantUser = await prisma.user.findFirst({ where: { tenantId: { not: transfer.tenantId }, status: "ACTIVE" } });
  if (wrongTenantUser) {
    const wrongToken = signAccessToken({ sub: wrongTenantUser.id.toString(), tenantId: wrongTenantUser.tenantId.toString(), roleId: wrongTenantUser.roleId.toString() });
    const wrongRes = await fetch("http://localhost:3000/api/v1/stock-transfers/14/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${wrongToken}` },
      body: JSON.stringify({ items: [{ stockTransferItemId: "15", receivedQuantity: "1" }] }),
    });
    console.log("WRONG-tenant token -> status", wrongRes.status, await wrongRes.text());
  }

  if (transfer.status === "IN_TRANSIT") {
    const item = transfer.items[0];
    const res = await fetch("http://localhost:3000/api/v1/stock-transfers/14/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: [{ stockTransferItemId: item.id.toString(), receivedQuantity: (item.shippedQuantity ?? "0").toString() }] }),
    });
    console.log("CORRECT-tenant token -> status", res.status, await res.text());
  } else {
    console.log("transfer 14 is no longer IN_TRANSIT, skipping the correct-tenant call");
  }
}

main().finally(() => prisma.$disconnect());
