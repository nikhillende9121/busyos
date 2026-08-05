import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("plan-tx")),
  },
}));

vi.mock("../repository/plan.repository", () => ({
  superAdminPlanRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    addFeatures: vi.fn(),
  },
}));

vi.mock("../repository/feature.repository", () => ({
  superAdminFeatureRepository: {
    findByCodes: vi.fn(),
  },
}));

import { superAdminPlanRepository } from "../repository/plan.repository";
import { superAdminFeatureRepository } from "../repository/feature.repository";
import { superAdminPlanService } from "../service/plan.service";

function planRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    name: "Starter",
    price: new Prisma.Decimal("999.00"),
    billingCycle: "MONTHLY",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    planFeatures: [{ planId: 1n, featureId: 10n, feature: { code: "PRODUCT" } }],
    ...overrides,
  };
}

describe("superAdminPlanService.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(superAdminPlanRepository.create).mockResolvedValue({ id: 1n } as never);
    vi.mocked(superAdminPlanRepository.findById).mockResolvedValue(planRow() as never);
  });

  it("validates every feature code exists before creating the plan", async () => {
    vi.mocked(superAdminFeatureRepository.findByCodes).mockResolvedValue([{ id: 10n, code: "PRODUCT" }] as never);

    const result = await superAdminPlanService.create({
      name: "Starter",
      price: "999.00",
      billingCycle: "MONTHLY",
      featureCodes: ["PRODUCT"],
    });

    expect(result.features).toEqual(["PRODUCT"]);
    expect(superAdminPlanRepository.addFeatures).toHaveBeenCalledWith("plan-tx", 1n, [10n]);
  });

  it("rejects an unknown feature code without creating a plan", async () => {
    vi.mocked(superAdminFeatureRepository.findByCodes).mockResolvedValue([]);

    await expect(
      superAdminPlanService.create({ name: "Starter", price: "999.00", billingCycle: "MONTHLY", featureCodes: ["NOT_REAL"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(superAdminPlanRepository.create).not.toHaveBeenCalled();
  });
});

describe("superAdminPlanService.list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps plans with their feature codes", async () => {
    vi.mocked(superAdminPlanRepository.findMany).mockResolvedValue([planRow()] as never);

    const result = await superAdminPlanService.list();

    expect(result).toEqual([
      {
        id: "1",
        name: "Starter",
        price: "999",
        billingCycle: "MONTHLY",
        features: ["PRODUCT"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});
