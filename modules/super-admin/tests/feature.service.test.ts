import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../repository/feature.repository", () => ({
  superAdminFeatureRepository: {
    findMany: vi.fn(),
    findByCodes: vi.fn(),
    create: vi.fn(),
  },
}));

import { superAdminFeatureRepository } from "../repository/feature.repository";
import { superAdminFeatureService } from "../service/feature.service";

function featureRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    name: "Products",
    code: "PRODUCT",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("superAdminFeatureService.list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps the feature catalog", async () => {
    vi.mocked(superAdminFeatureRepository.findMany).mockResolvedValue([featureRow()] as never);

    const result = await superAdminFeatureService.list();

    expect(result).toEqual([
      { id: "1", name: "Products", code: "PRODUCT", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });
});

describe("superAdminFeatureService.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a feature with a unique code", async () => {
    vi.mocked(superAdminFeatureRepository.create).mockResolvedValue(featureRow() as never);

    const result = await superAdminFeatureService.create({ name: "Products", code: "PRODUCT" });

    expect(result.code).toBe("PRODUCT");
  });

  it("maps a duplicate feature code to DUPLICATE_CODE", async () => {
    vi.mocked(superAdminFeatureRepository.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "test" }),
    );

    await expect(superAdminFeatureService.create({ name: "Products", code: "PRODUCT" })).rejects.toMatchObject({
      code: "DUPLICATE_CODE",
    });
  });
});
