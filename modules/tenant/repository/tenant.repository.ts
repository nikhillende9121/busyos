import { prisma } from "@/shared/database/prisma";

type TenantSettingsWrite = {
  companyName?: string;
  gstNumber?: string;
  currency?: string;
  timezone?: string;
  invoicePrefix?: string;
  decimalPrecision?: number;
  homeState?: string;
  taxInclusivePricing?: boolean;
  defaultTaxRateId?: bigint | null;
};

// Prisma queries only, scoped by tenantId — see MODULES.md -> repository/.
export const tenantRepository = {
  findByIdWithSettings(tenantId: bigint) {
    return prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true },
    });
  },

  // upsert, not update: a tenant created before settings existed (or one
  // that never touched a settings field) has no TenantSetting row yet — the
  // first PUT should create it, not 404.
  upsertSettings(tenantId: bigint, data: TenantSettingsWrite) {
    return prisma.tenantSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  },

  // Cross-entity ownership check (this tenant's chosen default rate really
  // belongs to it) — a direct query, not a call into modules/tax-rate's
  // service, matching modules/extra-charge/repository.ts's own
  // findTaxRateForTenant.
  findTaxRateForTenant(tenantId: bigint, id: bigint) {
    return prisma.taxRate.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  // Same "most recent ACTIVE/TRIAL" shape as shared/utils/subscription.ts's
  // getActiveSubscription(), plus the plan + its features — the tenant
  // admin's Subscription card needs the full picture, not just the row.
  findActiveSubscriptionWithPlan(tenantId: bigint) {
    return prisma.tenantSubscription.findFirst({
      where: { tenantId, status: { in: ["ACTIVE", "TRIAL"] } },
      orderBy: { createdAt: "desc" },
      include: { plan: { include: { planFeatures: { include: { feature: true } } } } },
    });
  },
};
