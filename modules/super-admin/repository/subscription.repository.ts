import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

const includePlan = { plan: true } as const;

// No tenantId scoping on findById-style lookups by itself — callers pass
// tenantId explicitly in the where clause, same "Super Admin operates
// across every tenant" precedent as tenant.repository.ts.
export const superAdminSubscriptionRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.tenantSubscription.findMany({
      where: { tenantId },
      include: includePlan,
      orderBy: { createdAt: "desc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.tenantSubscription.findFirst({
      where: { id, tenantId },
      include: includePlan,
    });
  },

  create(data: Prisma.TenantSubscriptionUncheckedCreateInput) {
    return prisma.tenantSubscription.create({ data, include: includePlan });
  },

  cancelById(id: bigint) {
    return prisma.tenantSubscription.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: includePlan,
    });
  },
};
