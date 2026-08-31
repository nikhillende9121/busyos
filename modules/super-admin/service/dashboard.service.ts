import { superAdminTenantRepository } from "../repository/tenant.repository";
import { superAdminSubscriptionRepository } from "../repository/subscription.repository";
import { superAdminFeatureRepository } from "../repository/feature.repository";
import { isSubscriptionExpired } from "@/shared/utils/subscription";
import type {
  SuperAdminDashboardView,
  TenantStatusBreakdown,
  MonthlyTenantGrowth,
  PlanDistribution,
  FeatureAdoption,
  ExpiringContract,
} from "../types/dashboard.types";
import type { Plan, Tenant, TenantSubscription } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const GROWTH_MONTHS = 12;
const EXPIRING_SOON_DAYS = 30;
const EXPIRING_SOONEST_LIMIT = 5;

type ContractRow = TenantSubscription & { plan: Plan; tenant: Pick<Tenant, "id" | "name" | "code"> };

// "Currently in force" — the exact same test subscription.service.ts's
// isCurrentlyActive applies (status ACTIVE/TRIAL and not past endDate),
// imported rather than re-derived so this dashboard and the Contracts
// page can never disagree about what counts as active.
function isCurrentlyActive(contract: TenantSubscription): boolean {
  return (contract.status === "ACTIVE" || contract.status === "TRIAL") && !isSubscriptionExpired(contract);
}

export const superAdminDashboardService = {
  async getDashboard(): Promise<SuperAdminDashboardView> {
    const [tenants, contracts, features, adoptionCounts] = await Promise.all([
      superAdminTenantRepository.findMany(),
      superAdminSubscriptionRepository.findManyAcrossTenants(),
      superAdminFeatureRepository.findMany(),
      superAdminFeatureRepository.countEnabledByFeature(),
    ]);

    const now = Date.now();
    const activeContracts = contracts.filter(isCurrentlyActive);

    return {
      totalTenants: tenants.length,
      tenantsByStatus: buildTenantStatusBreakdown(tenants),
      newTenantsLast30Days: tenants.filter((t) => now - t.createdAt.getTime() <= 30 * DAY_MS).length,
      activeContracts: activeContracts.length,
      expiringWithin30Days: activeContracts.filter(
        (c) => (c.endDate.getTime() - now) / DAY_MS <= EXPIRING_SOON_DAYS,
      ).length,
      mrrEstimate: computeMrrEstimate(activeContracts).toFixed(2),
      tenantGrowth: buildTenantGrowth(tenants),
      planDistribution: buildPlanDistribution(activeContracts),
      featureAdoption: buildFeatureAdoption(features, adoptionCounts),
      expiringSoonest: buildExpiringSoonest(activeContracts, now),
    };
  },
};

function buildTenantStatusBreakdown(tenants: Tenant[]): TenantStatusBreakdown[] {
  const counts = new Map<string, number>();
  for (const tenant of tenants) {
    counts.set(tenant.status, (counts.get(tenant.status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

function computeMrrEstimate(activeContracts: ContractRow[]): number {
  return activeContracts.reduce((sum, contract) => {
    const price = Number(contract.priceAtSigning);
    return sum + (contract.plan.billingCycle === "YEARLY" ? price / 12 : price);
  }, 0);
}

// Last GROWTH_MONTHS months, oldest first, zero-filled — a chart shouldn't
// skip a month with no signups.
function buildTenantGrowth(tenants: Tenant[]): MonthlyTenantGrowth[] {
  const now = new Date();
  const months: MonthlyTenantGrowth[] = [];
  for (let i = GROWTH_MONTHS - 1; i >= 0; i--) {
    const bucket = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: `${bucket.getFullYear()}-${String(bucket.getMonth() + 1).padStart(2, "0")}`, count: 0 });
  }
  const indexByMonth = new Map(months.map((m, index) => [m.month, index]));
  for (const tenant of tenants) {
    const key = `${tenant.createdAt.getFullYear()}-${String(tenant.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const index = indexByMonth.get(key);
    if (index !== undefined) {
      months[index].count += 1;
    }
  }
  return months;
}

function buildPlanDistribution(activeContracts: ContractRow[]): PlanDistribution[] {
  const counts = new Map<string, { planName: string; count: number }>();
  for (const contract of activeContracts) {
    const planId = contract.planId.toString();
    const existing = counts.get(planId);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(planId, { planName: contract.plan.name, count: 1 });
    }
  }
  return [...counts.entries()]
    .map(([planId, { planName, count }]) => ({ planId, planName, count }))
    .sort((a, b) => b.count - a.count);
}

function buildFeatureAdoption(
  features: { id: bigint; code: string; name: string }[],
  adoptionCounts: { featureId: bigint; _count: { featureId: number } }[],
): FeatureAdoption[] {
  const countByFeatureId = new Map(adoptionCounts.map((row) => [row.featureId.toString(), row._count.featureId]));
  return features
    .map((feature) => ({
      code: feature.code,
      name: feature.name,
      count: countByFeatureId.get(feature.id.toString()) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function buildExpiringSoonest(activeContracts: ContractRow[], now: number): ExpiringContract[] {
  return [...activeContracts]
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime())
    .slice(0, EXPIRING_SOONEST_LIMIT)
    .map((contract) => ({
      tenantId: contract.tenant.id.toString(),
      tenantName: contract.tenant.name,
      planName: contract.plan.name,
      endDate: contract.endDate.toISOString(),
      daysRemaining: Math.ceil((contract.endDate.getTime() - now) / DAY_MS),
    }));
}
