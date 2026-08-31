import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../repository/tenant.repository", () => ({
  superAdminTenantRepository: {
    findMany: vi.fn(),
  },
}));

vi.mock("../repository/subscription.repository", () => ({
  superAdminSubscriptionRepository: {
    findManyAcrossTenants: vi.fn(),
  },
}));

vi.mock("../repository/feature.repository", () => ({
  superAdminFeatureRepository: {
    findMany: vi.fn(),
    countEnabledByFeature: vi.fn(),
  },
}));

// Fully mocked (not vi.importOriginal) — the real module imports
// shared/database/prisma, which requires live DB_* env vars at import
// time. isSubscriptionExpired is reimplemented here rather than imported,
// since it's a small, stable, pure predicate.
vi.mock("@/shared/utils/subscription", () => ({
  isSubscriptionExpired: (subscription: { endDate: Date } | null) =>
    subscription !== null && subscription.endDate.getTime() < Date.now(),
}));

import { superAdminTenantRepository } from "../repository/tenant.repository";
import { superAdminSubscriptionRepository } from "../repository/subscription.repository";
import { superAdminFeatureRepository } from "../repository/feature.repository";
import { superAdminDashboardService } from "../service/dashboard.service";

function tenantRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    name: "Acme Retail",
    code: "acme",
    status: "ACTIVE",
    createdAt: new Date(),
    ...overrides,
  };
}

function contractRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    tenantId: 1n,
    planId: 2n,
    startDate: new Date("2026-01-01"),
    endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    status: "ACTIVE",
    priceAtSigning: new Prisma.Decimal("1200.00"),
    plan: { id: 2n, name: "Growth", billingCycle: "YEARLY" },
    tenant: { id: 1n, name: "Acme Retail", code: "acme" },
    ...overrides,
  };
}

describe("superAdminDashboardService.getDashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(superAdminTenantRepository.findMany).mockResolvedValue([]);
    vi.mocked(superAdminSubscriptionRepository.findManyAcrossTenants).mockResolvedValue([]);
    vi.mocked(superAdminFeatureRepository.findMany).mockResolvedValue([]);
    vi.mocked(superAdminFeatureRepository.countEnabledByFeature).mockResolvedValue([]);
  });

  it("counts tenants by status", async () => {
    vi.mocked(superAdminTenantRepository.findMany).mockResolvedValue([
      tenantRow({ status: "ACTIVE" }),
      tenantRow({ status: "ACTIVE" }),
      tenantRow({ status: "TRIAL" }),
    ] as never);

    const result = await superAdminDashboardService.getDashboard();

    expect(result.totalTenants).toBe(3);
    expect(result.tenantsByStatus).toEqual(
      expect.arrayContaining([
        { status: "ACTIVE", count: 2 },
        { status: "TRIAL", count: 1 },
      ]),
    );
  });

  it("excludes a status-ACTIVE contract that has already expired by date from activeContracts/expiringWithin30Days", async () => {
    vi.mocked(superAdminSubscriptionRepository.findManyAcrossTenants).mockResolvedValue([
      contractRow({ id: 1n, status: "ACTIVE", endDate: new Date("2020-01-01") }),
      contractRow({ id: 2n, status: "ACTIVE", endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) }),
    ] as never);

    const result = await superAdminDashboardService.getDashboard();

    expect(result.activeContracts).toBe(1);
    expect(result.expiringWithin30Days).toBe(1);
  });

  it("normalizes a YEARLY contract's price to monthly for the MRR estimate, and leaves a MONTHLY one alone", async () => {
    vi.mocked(superAdminSubscriptionRepository.findManyAcrossTenants).mockResolvedValue([
      contractRow({ id: 1n, priceAtSigning: new Prisma.Decimal("1200.00"), plan: { id: 2n, name: "Growth", billingCycle: "YEARLY" } }),
      contractRow({ id: 2n, priceAtSigning: new Prisma.Decimal("50.00"), plan: { id: 3n, name: "Starter", billingCycle: "MONTHLY" } }),
    ] as never);

    const result = await superAdminDashboardService.getDashboard();

    // 1200/12 + 50 = 150
    expect(result.mrrEstimate).toBe("150.00");
  });

  it("zero-fills a month with no signups in tenantGrowth", async () => {
    const result = await superAdminDashboardService.getDashboard();

    expect(result.tenantGrowth).toHaveLength(12);
    expect(result.tenantGrowth.every((m) => m.count === 0)).toBe(true);
  });

  it("includes a feature with zero enabled tenants at count 0", async () => {
    vi.mocked(superAdminFeatureRepository.findMany).mockResolvedValue([
      { id: 1n, code: "SALES", name: "Sales / POS" },
      { id: 2n, code: "GST_REPORT", name: "GST Report" },
    ] as never);
    vi.mocked(superAdminFeatureRepository.countEnabledByFeature).mockResolvedValue([
      { featureId: 1n, _count: { featureId: 3 } },
    ] as never);

    const result = await superAdminDashboardService.getDashboard();

    expect(result.featureAdoption).toEqual([
      { code: "SALES", name: "Sales / POS", count: 3 },
      { code: "GST_REPORT", name: "GST Report", count: 0 },
    ]);
  });

  it("returns at most 5 expiring contracts, soonest first", async () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      contractRow({ id: BigInt(i + 1), endDate: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000) }),
    ).reverse();
    vi.mocked(superAdminSubscriptionRepository.findManyAcrossTenants).mockResolvedValue(rows as never);

    const result = await superAdminDashboardService.getDashboard();

    expect(result.expiringSoonest).toHaveLength(5);
    expect(result.expiringSoonest[0].daysRemaining).toBeLessThanOrEqual(result.expiringSoonest[1].daysRemaining);
  });
});
