import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository/brand.repository", () => ({
  brandRepository: {
    findByIdForTenant: vi.fn(),
    create: vi.fn(),
    updateImage: vi.fn(),
    softDelete: vi.fn(),
    hasProducts: vi.fn(),
  },
}));

vi.mock("@/shared/utils/cloudinary", () => ({
  uploadImage: vi.fn(),
  destroyImage: vi.fn(),
  cloudinaryImageUrl: (publicId: string, transform: string) => `https://cdn.test/${transform}/${publicId}`,
  CLOUDINARY_TRANSFORM: { thumbnail: "thumb", full: "full", logo: "logo" },
}));

import { brandRepository } from "../repository/brand.repository";
import { uploadImage, destroyImage } from "@/shared/utils/cloudinary";
import { brandService } from "../service/brand.service";

function brandRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 3n,
    tenantId: 1n,
    name: "Acme",
    imagePublicId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("brandService.remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws RESOURCE_NOT_FOUND for a brand outside the tenant", async () => {
    vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(brandService.remove(1n, 999n)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("blocks deletion of a brand still assigned to products", async () => {
    vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue({ id: 3n } as never);
    vi.mocked(brandRepository.hasProducts).mockResolvedValue(true);

    await expect(brandService.remove(1n, 3n)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(brandRepository.softDelete).not.toHaveBeenCalled();
  });
});

describe("brandService.uploadImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uploadImage).mockResolvedValue("tenants/1/brands/3/new-public-id");
  });

  it("throws RESOURCE_NOT_FOUND for a brand outside the tenant", async () => {
    vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(
      brandService.uploadImage({ tenantId: 1n, brandId: 999n, file: makeFile("a.png", "image/png", 100) }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("rejects an unsupported mime type", async () => {
    vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(brandRow() as never);

    await expect(
      brandService.uploadImage({ tenantId: 1n, brandId: 3n, file: makeFile("a.pdf", "application/pdf", 100) }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("rejects a file over the 5MB limit", async () => {
    vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(brandRow() as never);

    await expect(
      brandService.uploadImage({ tenantId: 1n, brandId: 3n, file: makeFile("a.png", "image/png", 6 * 1024 * 1024) }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("uploads and persists an image when the brand has none yet", async () => {
    vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(brandRow({ imagePublicId: null }) as never);
    vi.mocked(brandRepository.updateImage).mockResolvedValue(
      brandRow({ imagePublicId: "tenants/1/brands/3/new-public-id" }) as never,
    );

    const result = await brandService.uploadImage({
      tenantId: 1n,
      brandId: 3n,
      file: makeFile("a.png", "image/png", 100),
    });

    expect(destroyImage).not.toHaveBeenCalled();
    expect(uploadImage).toHaveBeenCalledWith(expect.any(Buffer), "image/png", "tenants/1/brands/3");
    expect(brandRepository.updateImage).toHaveBeenCalledWith(3n, "tenants/1/brands/3/new-public-id");
    expect(result.imageUrl).toContain("tenants/1/brands/3/new-public-id");
  });

  it("destroys the old Cloudinary asset before uploading a replacement", async () => {
    vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(
      brandRow({ imagePublicId: "tenants/1/brands/3/old-public-id" }) as never,
    );
    vi.mocked(brandRepository.updateImage).mockResolvedValue(
      brandRow({ imagePublicId: "tenants/1/brands/3/new-public-id" }) as never,
    );

    await brandService.uploadImage({ tenantId: 1n, brandId: 3n, file: makeFile("a.png", "image/png", 100) });

    expect(destroyImage).toHaveBeenCalledWith("tenants/1/brands/3/old-public-id");
  });
});

describe("brandService.removeImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws RESOURCE_NOT_FOUND for a brand outside the tenant", async () => {
    vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(brandService.removeImage({ tenantId: 1n, brandId: 999n })).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("is a no-op when the brand has no image set", async () => {
    vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(brandRow({ imagePublicId: null }) as never);

    const result = await brandService.removeImage({ tenantId: 1n, brandId: 3n });

    expect(destroyImage).not.toHaveBeenCalled();
    expect(brandRepository.updateImage).not.toHaveBeenCalled();
    expect(result.imageUrl).toBeNull();
  });

  it("destroys the asset and clears the column when an image is set", async () => {
    vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(
      brandRow({ imagePublicId: "tenants/1/brands/3/old-public-id" }) as never,
    );
    vi.mocked(brandRepository.updateImage).mockResolvedValue(brandRow({ imagePublicId: null }) as never);

    const result = await brandService.removeImage({ tenantId: 1n, brandId: 3n });

    expect(destroyImage).toHaveBeenCalledWith("tenants/1/brands/3/old-public-id");
    expect(brandRepository.updateImage).toHaveBeenCalledWith(3n, null);
    expect(result.imageUrl).toBeNull();
  });
});
