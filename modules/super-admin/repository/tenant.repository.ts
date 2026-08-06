import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma, TenantStatus } from "@prisma/client";

// Shared by getActivePlanLimits (shared/utils/plan-limits.ts) — kept here
// too since the plan-change/resync flow below needs the full subscription
// row (id, plan+planFeatures), not just the limit fields that helper
// returns.
const ACTIVE_SUBSCRIPTION_STATUSES: ("ACTIVE" | "TRIAL")[] = ["ACTIVE", "TRIAL"];

// No tenantId scoping anywhere here, deliberately — a Super Admin operates
// across every tenant (see Docs/business-rules/roles-and-permissions.md ->
// Super Admin), the one part of the system where that's correct rather
// than a bug.
// Current plan, for display/changePlan purposes — most recent ACTIVE/TRIAL
// subscription's plan, name only (id + name is all the tenants list needs
// to render and let a Super Admin change it).
const includeCurrentPlan = {
  subscriptions: {
    where: { status: { in: ACTIVE_SUBSCRIPTION_STATUSES } },
    orderBy: { createdAt: "desc" },
    take: 1,
    include: { plan: { select: { id: true, name: true } } },
  },
} as const;

export const superAdminTenantRepository = {
  findMany() {
    return prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: includeCurrentPlan,
    });
  },

  findById(id: bigint) {
    return prisma.tenant.findFirst({ where: { id, deletedAt: null }, include: includeCurrentPlan });
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

  // The tenant's current plan for quota/feature purposes — most recent
  // ACTIVE/TRIAL subscription. Used by changePlan (to know what to
  // cancel) and resyncFeatures (to know what the tenant SHOULD have).
  findActiveSubscription(tenantId: bigint) {
    return prisma.tenantSubscription.findFirst({
      where: { tenantId, status: { in: ACTIVE_SUBSCRIPTION_STATUSES } },
      orderBy: { createdAt: "desc" },
      include: { plan: { include: { planFeatures: true } } },
    });
  },

  cancelSubscription(db: Db, id: bigint) {
    return db.tenantSubscription.update({ where: { id }, data: { status: "CANCELLED" } });
  },

  // Every tenant currently subscribed to a plan — used to resync everyone
  // affected when a Super Admin edits that plan's feature list.
  async findTenantIdsOnPlan(planId: bigint): Promise<bigint[]> {
    const rows = await prisma.tenantSubscription.findMany({
      where: { planId, status: { in: ACTIVE_SUBSCRIPTION_STATUSES } },
      select: { tenantId: true },
    });
    return rows.map((row) => row.tenantId);
  },

  findEnabledFeatureIds(tenantId: bigint): Promise<{ featureId: bigint }[]> {
    return prisma.tenantFeature.findMany({ where: { tenantId, enabled: true }, select: { featureId: true } });
  },

  // Upsert, not create — a tenant re-gaining a feature it previously lost
  // (or vice versa) toggles the same row rather than erroring on the
  // (tenantId, featureId) unique constraint.
  setFeatureEnabled(db: Db, tenantId: bigint, featureId: bigint, enabled: boolean) {
    return db.tenantFeature.upsert({
      where: { tenantId_featureId: { tenantId, featureId } },
      create: { tenantId, featureId, enabled },
      update: { enabled },
    });
  },
};
