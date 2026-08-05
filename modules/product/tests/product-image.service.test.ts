import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("image-tx")),
  },
}));

vi.mock("@/shared/utils/cloudinary", () => ({
  uploadImage: vi.fn(),
  destroyImage: vi.fn(),
  cloudinaryImageUrl: (publicId: string, transform: string) => `https://cdn.test/${transform}/${publicId}`,
  CLOUDINARY_TRANSFORM: { thumbnail: "thumb", full: "full" },
}));

vi.mock("../repository/product-image.repository", () => ({
  productImageRepository: {
    countByProduct: vi.fn(),
    nextSortOrder: vi.fn(),
    create: vi.fn(),
    findByIdForProduct: vi.fn(),
    findAllForProduct: vi.fn(),
    remove: vi.fn(),
    swapSortOrder: vi.fn(),
  },
}));

vi.mock("../repository/product.repository", () => ({
  productRepository: {
    findByIdForTenant: vi.fn(),
  },
}));

import { productImageRepository } from "../repository/product-image.repository";
import { productRepository } from "../repository/product.repository";
import { uploadImage, destroyImage } from "@/shared/utils/cloudinary";
import { productImageService } from "../service/product-image.service";

function imageRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 500n,
    productId: 100n,
    publicId: "tenants/1/products/100/abc",
    sortOrder: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("productImageService.upload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(productRepository.findByIdForTenant).mockResolvedValue({ id: 100n } as never);
    vi.mocked(productImageRepository.countByProduct).mockResolvedValue(0);
    vi.mocked(productImageRepository.nextSortOrder).mockResolvedValue(0);
    vi.mocked(uploadImage).mockResolvedValue("new-public-id");
    vi.mocked(productImageRepository.create).mockImplementation(
      (data) => Promise.resolve(imageRow({ ...data, id: 501n })) as never,
    );
  });

  it("throws RESOURCE_NOT_FOUND for a product outside the tenant", async () => {
    vi.mocked(productRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(
      productImageService.upload({ tenantId: 1n, productId: 999n, files: [makeFile("a.png", "image/png", 100)] }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(productImageRepository.create).not.toHaveBeenCalled();
  });

  it("rejects an unsupported mime type", async () => {
    await expect(
      productImageService.upload({
        tenantId: 1n,
        productId: 100n,
        files: [makeFile("a.pdf", "application/pdf", 100)],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(productImageRepository.create).not.toHaveBeenCalled();
  });

  it("rejects a file over the 5MB limit", async () => {
    await expect(
      productImageService.upload({
        tenantId: 1n,
        productId: 100n,
        files: [makeFile("big.png", "image/png", 6 * 1024 * 1024)],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(productImageRepository.create).not.toHaveBeenCalled();
  });

  it("rejects uploads that would exceed the 8-image cap", async () => {
    vi.mocked(productImageRepository.countByProduct).mockResolvedValue(7);

    await expect(
      productImageService.upload({
        tenantId: 1n,
        productId: 100n,
        files: [makeFile("a.png", "image/png", 100), makeFile("b.png", "image/png", 100)],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(productImageRepository.create).not.toHaveBeenCalled();
  });

  it("uploads each file to Cloudinary and creates a row with sequential sortOrder", async () => {
    vi.mocked(productImageRepository.nextSortOrder).mockResolvedValue(3);

    const images = await productImageService.upload({
      tenantId: 1n,
      productId: 100n,
      files: [makeFile("a.png", "image/png", 100), makeFile("b.png", "image/png", 100)],
    });

    expect(uploadImage).toHaveBeenCalledTimes(2);
    expect(uploadImage).toHaveBeenCalledWith(expect.any(Buffer), "image/png", "tenants/1/products/100");
    expect(productImageRepository.create).toHaveBeenNthCalledWith(1, {
      productId: 100n,
      publicId: "new-public-id",
      sortOrder: 3,
    });
    expect(productImageRepository.create).toHaveBeenNthCalledWith(2, {
      productId: 100n,
      publicId: "new-public-id",
      sortOrder: 4,
    });
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ id: "501", thumbnailUrl: "https://cdn.test/thumb/new-public-id" });
  });
});

describe("productImageService.remove", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(productRepository.findByIdForTenant).mockResolvedValue({ id: 100n } as never);
  });

  it("throws RESOURCE_NOT_FOUND for a product outside the tenant", async () => {
    vi.mocked(productRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(productImageService.remove({ tenantId: 1n, productId: 999n, imageId: 500n })).rejects.toMatchObject(
      { code: "RESOURCE_NOT_FOUND" },
    );
    expect(destroyImage).not.toHaveBeenCalled();
  });

  it("throws RESOURCE_NOT_FOUND for an image outside the product", async () => {
    vi.mocked(productImageRepository.findByIdForProduct).mockResolvedValue(null);

    await expect(productImageService.remove({ tenantId: 1n, productId: 100n, imageId: 999n })).rejects.toMatchObject(
      { code: "RESOURCE_NOT_FOUND" },
    );
    expect(destroyImage).not.toHaveBeenCalled();
  });

  it("destroys the Cloudinary asset and deletes the row", async () => {
    vi.mocked(productImageRepository.findByIdForProduct).mockResolvedValue(imageRow() as never);

    await productImageService.remove({ tenantId: 1n, productId: 100n, imageId: 500n });

    expect(destroyImage).toHaveBeenCalledWith("tenants/1/products/100/abc");
    expect(productImageRepository.remove).toHaveBeenCalledWith(500n);
  });
});

describe("productImageService.makePrimary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(productRepository.findByIdForTenant).mockResolvedValue({ id: 100n } as never);
  });

  it("throws RESOURCE_NOT_FOUND for a product outside the tenant", async () => {
    vi.mocked(productRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(
      productImageService.makePrimary({ tenantId: 1n, productId: 999n, imageId: 500n }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("throws RESOURCE_NOT_FOUND for an image outside the product", async () => {
    vi.mocked(productImageRepository.findAllForProduct).mockResolvedValue([imageRow()] as never);

    await expect(
      productImageService.makePrimary({ tenantId: 1n, productId: 100n, imageId: 999n }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("is a no-op when the target is already primary", async () => {
    vi.mocked(productImageRepository.findAllForProduct).mockResolvedValue([imageRow({ id: 500n, sortOrder: 0 })] as never);

    await productImageService.makePrimary({ tenantId: 1n, productId: 100n, imageId: 500n });

    expect(productImageRepository.swapSortOrder).not.toHaveBeenCalled();
  });

  it("swaps sortOrder with the current primary", async () => {
    vi.mocked(productImageRepository.findAllForProduct).mockResolvedValue([
      imageRow({ id: 500n, sortOrder: 0 }),
      imageRow({ id: 501n, sortOrder: 1 }),
    ] as never);

    await productImageService.makePrimary({ tenantId: 1n, productId: 100n, imageId: 501n });

    expect(productImageRepository.swapSortOrder).toHaveBeenCalledWith("image-tx", 500n, 0, 501n, 1);
  });
});
