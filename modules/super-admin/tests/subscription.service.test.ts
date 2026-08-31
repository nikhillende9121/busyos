import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../repository/subscription.repository", () => ({
  superAdminSubscriptionRepository: {
    findManyByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    create: vi.fn(),
    cancelById: vi.fn(),
  },
}));

vi.mock("../repository/tenant.repository", () => ({
  superAdminTenantRepository: {
    findPlanById: vi.fn(),
  },
}));

vi.mock("../service/tenant.service", () => ({
  superAdminTenantService: {
    resyncFeatures: vi.fn(),
  },
}));

// Fully mocked (not vi.importOriginal) — the real module imports
// shared/database/prisma, which requires live DB_* env vars at import
// time. isSubscriptionExpired is reimplemented here rather than imported,
// since it's a small, stable, pure predicate.
vi.mock("@/shared/utils/subscription", () => ({
  getActiveSubscription: vi.fn(),
  isSubscriptionExpired: (subscription: { endDate: Date } | null) =>
    subscription !== null && subscription.endDate.getTime() < Date.now(),
}));

import { superAdminSubscriptionRepository } from "../repository/subscription.repository";
import { superAdminTenantRepository } from "../repository/tenant.repository";
import { superAdminTenantService } from "../service/tenant.service";
import { getActiveSubscription } from "@/shared/utils/subscription";
import { superAdminSubscriptionService } from "../service/subscription.service";

function contractRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    tenantId: 5n,
    planId: 2n,
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2027-01-01T00:00:00.000Z"),
    status: "ACTIVE",
    priceAtSigning: new Prisma.Decimal("999.00"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    plan: { id: 2n, name: "Growth" },
    ...overrides,
  };
}

describe("superAdminSubscriptionService.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(superAdminTenantRepository.findPlanById).mockResolvedValue({
      id: 2n,
      price: new Prisma.Decimal("999.00"),
    } as never);
    vi.mocked(getActiveSubscription).mockResolvedValue(null);
    vi.mocked(superAdminSubscriptionRepository.create).mockResolvedValue(contractRow() as never);
  });

  it("rejects an unknown planId", async () => {
    vi.mocked(superAdminTenantRepository.findPlanById).mockResolvedValue(null);

    await expect(
      superAdminSubscriptionService.create({
        tenantId: 5n,
        planId: 999n,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(superAdminSubscriptionRepository.create).not.toHaveBeenCalled();
  });

  it("blocks creation when an unexpired active contract already exists", async () => {
    vi.mocked(getActiveSubscription).mockResolvedValue({ endDate: new Date(Date.now() + 86400000) } as never);

    await expect(
      superAdminSubscriptionService.create({
        tenantId: 5n,
        planId: 2n,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2027-01-01"),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(superAdminSubscriptionRepository.create).not.toHaveBeenCalled();
  });

  it("allows creation when the existing active-status contract has already expired by date", async () => {
    vi.mocked(getActiveSubscription).mockResolvedValue({ endDate: new Date("2020-01-01") } as never);

    await superAdminSubscriptionService.create({
      tenantId: 5n,
      planId: 2n,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-01-01"),
    });

    expect(superAdminSubscriptionRepository.create).toHaveBeenCalled();
  });

  it("snapshots the plan's price as priceAtSigning and resyncs features", async () => {
    await superAdminSubscriptionService.create({
      tenantId: 5n,
      planId: 2n,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-01-01"),
    });

    expect(superAdminSubscriptionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 5n,
        planId: 2n,
        status: "ACTIVE",
        priceAtSigning: new Prisma.Decimal("999.00"),
      }),
    );
    expect(superAdminTenantService.resyncFeatures).toHaveBeenCalledWith(5n);
  });
});

describe("superAdminSubscriptionService.cancel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws RESOURCE_NOT_FOUND when the contract doesn't belong to the tenant", async () => {
    vi.mocked(superAdminSubscriptionRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(superAdminSubscriptionService.cancel({ tenantId: 5n, subscriptionId: 1n })).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("throws CONFLICT when the target isn't currently active/trial", async () => {
    vi.mocked(superAdminSubscriptionRepository.findByIdForTenant).mockResolvedValue(
      contractRow({ status: "CANCELLED" }) as never,
    );

    await expect(superAdminSubscriptionService.cancel({ tenantId: 5n, subscriptionId: 1n })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(superAdminSubscriptionRepository.cancelById).not.toHaveBeenCalled();
  });

  it("cancels an active contract and resyncs features", async () => {
    vi.mocked(superAdminSubscriptionRepository.findByIdForTenant).mockResolvedValue(contractRow() as never);
    vi.mocked(superAdminSubscriptionRepository.cancelById).mockResolvedValue(
      contractRow({ status: "CANCELLED" }) as never,
    );

    const result = await superAdminSubscriptionService.cancel({ tenantId: 5n, subscriptionId: 1n });

    expect(superAdminSubscriptionRepository.cancelById).toHaveBeenCalledWith(1n);
    expect(superAdminTenantService.resyncFeatures).toHaveBeenCalledWith(5n);
    expect(result.status).toBe("CANCELLED");
  });
});
