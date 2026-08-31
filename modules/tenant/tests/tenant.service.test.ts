import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository/tenant.repository", () => ({
  tenantRepository: {
    findByIdWithSettings: vi.fn(),
    upsertSettings: vi.fn(),
    findTaxRateForTenant: vi.fn(),
    findActiveSubscriptionWithPlan: vi.fn(),
  },
}));

import { tenantRepository } from "../repository/tenant.repository";
import { tenantService } from "../service/tenant.service";

function tenantRow(overrides: Partial<{ settings: unknown }> = {}) {
  return {
    id: 1n,
    name: "Acme Retail",
    code: "acme",
    status: "ACTIVE",
    settings: null,
    ...overrides,
  };
}

describe("tenantService.getProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps bigint id to a string and settings to null when none exist yet", async () => {
    vi.mocked(tenantRepository.findByIdWithSettings).mockResolvedValue(tenantRow() as never);

    const profile = await tenantService.getProfile(1n);

    expect(profile).toEqual({
      id: "1",
      name: "Acme Retail",
      code: "acme",
      status: "ACTIVE",
      settings: null,
    });
  });

  it("maps settings when present", async () => {
    vi.mocked(tenantRepository.findByIdWithSettings).mockResolvedValue(
      tenantRow({
        settings: {
          companyName: "Acme Pvt Ltd",
          gstNumber: "27AAAAA0000A1Z5",
          currency: "INR",
          timezone: "Asia/Kolkata",
          invoicePrefix: "ACM-",
          decimalPrecision: 2,
          homeState: "Maharashtra",
          taxInclusivePricing: false,
          defaultTaxRateId: 5n,
        },
      }) as never,
    );

    const profile = await tenantService.getProfile(1n);

    expect(profile.settings).toEqual({
      companyName: "Acme Pvt Ltd",
      gstNumber: "27AAAAA0000A1Z5",
      currency: "INR",
      timezone: "Asia/Kolkata",
      invoicePrefix: "ACM-",
      decimalPrecision: 2,
      homeState: "Maharashtra",
      taxInclusivePricing: false,
      defaultTaxRateId: "5",
    });
  });

  it("throws RESOURCE_NOT_FOUND if the tenant row is somehow gone", async () => {
    vi.mocked(tenantRepository.findByIdWithSettings).mockResolvedValue(null);

    await expect(tenantService.getProfile(999n)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });
});

describe("tenantService.updateSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts only the provided fields and returns the refreshed profile", async () => {
    vi.mocked(tenantRepository.upsertSettings).mockResolvedValue({} as never);
    vi.mocked(tenantRepository.findByIdWithSettings).mockResolvedValue(
      tenantRow({
        settings: {
          companyName: "New Name",
          gstNumber: null,
          currency: "INR",
          timezone: "Asia/Kolkata",
          invoicePrefix: null,
          decimalPrecision: 2,
          homeState: null,
          taxInclusivePricing: false,
          defaultTaxRateId: null,
        },
      }) as never,
    );

    const profile = await tenantService.updateSettings({ tenantId: 1n, companyName: "New Name" });

    expect(tenantRepository.upsertSettings).toHaveBeenCalledWith(1n, { companyName: "New Name" });
    expect(profile.settings?.companyName).toBe("New Name");
    expect(tenantRepository.findTaxRateForTenant).not.toHaveBeenCalled();
  });

  it("rejects a defaultTaxRateId that doesn't belong to this tenant", async () => {
    vi.mocked(tenantRepository.findTaxRateForTenant).mockResolvedValue(null);

    await expect(
      tenantService.updateSettings({ tenantId: 1n, defaultTaxRateId: 999n }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(tenantRepository.upsertSettings).not.toHaveBeenCalled();
  });

  it("accepts a defaultTaxRateId that belongs to this tenant", async () => {
    vi.mocked(tenantRepository.findTaxRateForTenant).mockResolvedValue({ id: 5n } as never);
    vi.mocked(tenantRepository.upsertSettings).mockResolvedValue({} as never);
    vi.mocked(tenantRepository.findByIdWithSettings).mockResolvedValue(tenantRow() as never);

    await tenantService.updateSettings({ tenantId: 1n, defaultTaxRateId: 5n });

    expect(tenantRepository.upsertSettings).toHaveBeenCalledWith(1n, { defaultTaxRateId: 5n });
  });
});

describe("tenantService.getSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the tenant has no subscription on record", async () => {
    vi.mocked(tenantRepository.findActiveSubscriptionWithPlan).mockResolvedValue(null);

    const result = await tenantService.getSubscription(1n);

    expect(result).toBeNull();
  });

  it("maps the active subscription, its plan, and feature list", async () => {
    const endDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    vi.mocked(tenantRepository.findActiveSubscriptionWithPlan).mockResolvedValue({
      status: "ACTIVE",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate,
      priceAtSigning: { toString: () => "24999.00" },
      plan: {
        name: "Growth",
        billingCycle: "YEARLY",
        maxWarehouses: 5,
        maxUsers: 15,
        maxRoles: 10,
        planFeatures: [
          { feature: { code: "SALES", name: "Sales / POS" } },
          { feature: { code: "DISCOUNT", name: "Discounts" } },
        ],
      },
    } as never);

    const result = await tenantService.getSubscription(1n);

    expect(result).toMatchObject({
      status: "ACTIVE",
      isExpiredByDate: false,
      daysRemaining: 5,
      priceAtSigning: "24999.00",
      plan: { name: "Growth", billingCycle: "YEARLY", maxWarehouses: 5, maxUsers: 15, maxRoles: 10 },
      features: [
        { code: "SALES", name: "Sales / POS" },
        { code: "DISCOUNT", name: "Discounts" },
      ],
    });
  });

  it("flags a contract as expired by date once its endDate has passed", async () => {
    vi.mocked(tenantRepository.findActiveSubscriptionWithPlan).mockResolvedValue({
      status: "ACTIVE",
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      endDate: new Date("2020-06-01T00:00:00.000Z"),
      priceAtSigning: { toString: () => "999.00" },
      plan: {
        name: "Starter",
        billingCycle: "YEARLY",
        maxWarehouses: 1,
        maxUsers: 3,
        maxRoles: 3,
        planFeatures: [],
      },
    } as never);

    const result = await tenantService.getSubscription(1n);

    expect(result?.isExpiredByDate).toBe(true);
  });
});
