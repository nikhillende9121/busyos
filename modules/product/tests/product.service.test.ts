import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../repository/product.repository", () => ({
  productRepository: {
    findManyByTenant: vi.fn(),
    countByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    categoryBelongsToTenant: vi.fn(),
    brandBelongsToTenant: vi.fn(),
    unitBelongsToTenant: vi.fn(),
    taxRateBelongsToTenant: vi.fn(),
  },
}));

import { productRepository } from "../repository/product.repository";
import { productService } from "../service/product.service";

function productRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 100n,
    tenantId: 1n,
    categoryId: null,
    brandId: null,
    unitId: null,
    sku: "RICE-5KG",
    barcode: null,
    name: "Basmati Rice 5kg",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    images: [],
    ...overrides,
  };
}

describe("productService.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps rows to string ids and builds pagination from the total count", async () => {
    vi.mocked(productRepository.findManyByTenant).mockResolvedValue([productRow()] as never);
    vi.mocked(productRepository.countByTenant).mockResolvedValue(45);

    const result = await productService.list({
      tenantId: 1n,
      page: 2,
      pageSize: 20,
      sortBy: "name",
      sortDir: "asc",
    });

    expect(productRepository.findManyByTenant).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({ skip: 20, take: 20 }),
    );
    expect(result.items[0]).toMatchObject({ id: "100", sku: "RICE-5KG" });
    expect(result.pagination).toEqual({ page: 2, pageSize: 20, total: 45, totalPages: 3 });
  });
});

describe("productService.getById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws RESOURCE_NOT_FOUND for a product outside the tenant", async () => {
    vi.mocked(productRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(productService.getById(1n, 999n)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });
});

describe("productService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(productRepository.categoryBelongsToTenant).mockResolvedValue(true);
    vi.mocked(productRepository.brandBelongsToTenant).mockResolvedValue(true);
    vi.mocked(productRepository.unitBelongsToTenant).mockResolvedValue(true);
  });

  it("creates a product when all references belong to the tenant", async () => {
    vi.mocked(productRepository.create).mockResolvedValue(productRow() as never);

    const product = await productService.create({
      tenantId: 1n,
      sku: "RICE-5KG",
      name: "Basmati Rice 5kg",
      categoryId: 7n,
    });

    expect(product.sku).toBe("RICE-5KG");
    expect(productRepository.categoryBelongsToTenant).toHaveBeenCalledWith(1n, 7n);
  });

  it("rejects a categoryId that belongs to another tenant, before ever calling create", async () => {
    vi.mocked(productRepository.categoryBelongsToTenant).mockResolvedValue(false);

    await expect(
      productService.create({ tenantId: 1n, sku: "RICE-5KG", name: "Rice", categoryId: 999n }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(productRepository.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate sku constraint violation to DUPLICATE_SKU", async () => {
    vi.mocked(productRepository.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["tenantId", "sku"] },
      }),
    );

    await expect(
      productService.create({ tenantId: 1n, sku: "RICE-5KG", name: "Rice" }),
    ).rejects.toMatchObject({ code: "DUPLICATE_SKU" });
  });

  it("maps a duplicate barcode constraint violation to DUPLICATE_BARCODE, not DUPLICATE_SKU", async () => {
    vi.mocked(productRepository.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["tenantId", "barcode"] },
      }),
    );

    await expect(
      productService.create({ tenantId: 1n, sku: "RICE-5KG", barcode: "12345", name: "Rice" }),
    ).rejects.toMatchObject({ code: "DUPLICATE_BARCODE" });
  });
});

describe("productService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws RESOURCE_NOT_FOUND before validating references or writing", async () => {
    vi.mocked(productRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(
      productService.update({ tenantId: 1n, productId: 999n, name: "New name" }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });

    expect(productRepository.update).not.toHaveBeenCalled();
  });

  it("rejects re-pointing a product at another tenant's brand", async () => {
    vi.mocked(productRepository.findByIdForTenant).mockResolvedValue(productRow() as never);
    vi.mocked(productRepository.brandBelongsToTenant).mockResolvedValue(false);

    await expect(
      productService.update({ tenantId: 1n, productId: 100n, brandId: 55n }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(productRepository.update).not.toHaveBeenCalled();
  });
});

describe("productService.remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("soft-deletes an existing product", async () => {
    vi.mocked(productRepository.findByIdForTenant).mockResolvedValue(productRow() as never);

    await productService.remove(1n, 100n, 42n);

    expect(productRepository.softDelete).toHaveBeenCalledWith(100n, 42n);
  });

  it("throws RESOURCE_NOT_FOUND instead of soft-deleting a product outside the tenant", async () => {
    vi.mocked(productRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(productService.remove(1n, 999n)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
    expect(productRepository.softDelete).not.toHaveBeenCalled();
  });
});
