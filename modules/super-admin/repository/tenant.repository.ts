import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma, TenantStatus } from "@prisma/client";

// No tenantId scoping anywhere here, deliberately — a Super Admin operates
// across every tenant (see Docs/business-rules/roles-and-permissions.md ->
// Super Admin), the one part of the system where that's correct rather
// than a bug.
export const superAdminTenantRepository = {
  findMany() {
    return prisma.tenant.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  },

  findById(id: bigint) {
    return prisma.tenant.findFirst({ where: { id, deletedAt: null } });
  },

  create(db: Db, data: Prisma.TenantCreateInput) {
    return db.tenant.create({ data });
  },

  updateStatus(id: bigint, status: TenantStatus) {
    return prisma.tenant.update({ where: { id }, data: { status } });
  },

  updateLogo(id: bigint, logoPublicId: string | null) {
    return prisma.tenant.update({ where: { id }, data: { logoPublicId } });
  },

  createSetting(db: Db, data: Prisma.TenantSettingUncheckedCreateInput) {
    return db.tenantSetting.create({ data });
  },

  findPlanById(id: bigint) {
    return prisma.plan.findUnique({ where: { id }, include: { planFeatures: true } });
  },

  createSubscription(db: Db, data: Prisma.TenantSubscriptionUncheckedCreateInput) {
    return db.tenantSubscription.create({ data });
  },

  enableFeatures(db: Db, tenantId: bigint, featureIds: bigint[]): Promise<Prisma.BatchPayload> {
    return db.tenantFeature.createMany({
      data: featureIds.map((featureId) => ({ tenantId, featureId, enabled: true })),
    });
  },
};
