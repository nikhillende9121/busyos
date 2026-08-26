import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository/category.repository", () => ({
  categoryRepository: {
    findManyByTenant: vi.fn(),
    findByIdForTenant: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateImage: vi.fn(),
    softDelete: vi.fn(),
    hasProducts: vi.fn(),
    hasChildren: vi.fn(),
  },
}));

vi.mock("@/shared/utils/cloudinary", () => ({
  uploadImage: vi.fn(),
  destroyImage: vi.fn(),
  cloudinaryImageUrl: (publicId: string, transform: string) => `https://cdn.test/${transform}/${publicId}`,
  CLOUDINARY_TRANSFORM: { thumbnail: "thumb", full: "full", logo: "logo" },
}));

import { categoryRepository } from "../repository/category.repository";
import { uploadImage, destroyImage } from "@/shared/utils/cloudinary";
import { categoryService } from "../service/category.service";

function categoryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10n,
    tenantId: 1n,
    parentId: null,
    name: "Grocery",
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

describe("categoryService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a parentId that belongs to another tenant", async () => {
    vi.mocked(categoryRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(
      categoryService.create({ tenantId: 1n, name: "Snacks", parentId: 999n }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(categoryRepository.create).not.toHaveBeenCalled();
  });

  it("creates a category without a parentId cleanly", async () => {
    vi.mocked(categoryRepository.create).mockResolvedValue(categoryRow({ name: "Beverages", parentId: null }) as never);

    const result = await categoryService.create({ tenantId: 1n, name: "Beverages", parentId: null });

    expect(result.name).toBe("Beverages");
    expect(result.parentId).toBeNull();
    expect(categoryRepository.findByIdForTenant).not.toHaveBeenCalled();
    expect(categoryRepository.create).toHaveBeenCalledWith({
      tenantId: 1n,
      name: "Beverages",
      parentId: null,
    });
  });
});

describe("categoryService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a category being set as its own parent", async () => {
    vi.mocked(categoryRepository.findByIdForTenant).mockResolvedValue(categoryRow() as never);

    await expect(
      categoryService.update({ tenantId: 1n, categoryId: 10n, parentId: 10n }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(categoryRepository.update).not.toHaveBeenCalled();
  });
});

describe("categoryService.remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(categoryRepository.findByIdForTenant).mockResolvedValue(categoryRow() as never);
  });

  it("blocks deletion when the category still has products", async () => {
    vi.mocked(categoryRepository.hasProducts).mockResolvedValue(true);
    vi.mocked(categoryRepository.hasChildren).mockResolvedValue(false);

    await expect(categoryService.remove(1n, 10n)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(categoryRepository.softDelete).not.toHaveBeenCalled();
  });

  it("blocks deletion when the category still has subcategories", async () => {
    vi.mocked(categoryRepository.hasProducts).mockResolvedValue(false);
    vi.mocked(categoryRepository.hasChildren).mockResolvedValue(true);

    await expect(categoryService.remove(1n, 10n)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(categoryRepository.softDelete).not.toHaveBeenCalled();
  });

  it("soft-deletes a category with no products or subcategories", async () => {
    vi.mocked(categoryRepository.hasProducts).mockResolvedValue(false);
    vi.mocked(categoryRepository.hasChildren).mockResolvedValue(false);

    await categoryService.remove(1n, 10n);

    expect(categoryRepository.softDelete).toHaveBeenCalledWith(10n);
  });
});

describe("categoryService.uploadImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uploadImage).mockResolvedValue("tenants/1/categories/10/new-public-id");
  });

  it("throws RESOURCE_NOT_FOUND for a category outside the tenant", async () => {
    vi.mocked(categoryRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(
      categoryService.uploadImage({ tenantId: 1n, categoryId: 999n, file: makeFile("a.png", "image/png", 100) }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("rejects an unsupported mime type", async () => {
    vi.mocked(categoryRepository.findByIdForTenant).mockResolvedValue(categoryRow() as never);

    await expect(
      categoryService.uploadImage({ tenantId: 1n, categoryId: 10n, file: makeFile("a.pdf", "application/pdf", 100) }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("rejects a file over the 5MB limit", async () => {
    vi.mocked(categoryRepository.findByIdForTenant).mockResolvedValue(categoryRow() as never);

    await expect(
      categoryService.uploadImage({
        tenantId: 1n,
        categoryId: 10n,
        file: makeFile("a.png", "image/png", 6 * 1024 * 1024),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("uploads and persists an image when the category has none yet", async () => {
    vi.mocked(categoryRepository.findByIdForTenant).mockResolvedValue(categoryRow({ imagePublicId: null }) as never);
    vi.mocked(categoryRepository.updateImage).mockResolvedValue(
      categoryRow({ imagePublicId: "tenants/1/categories/10/new-public-id" }) as never,
    );

    const result = await categoryService.uploadImage({
      tenantId: 1n,
      categoryId: 10n,
      file: makeFile("a.png", "image/png", 100),
    });

    expect(destroyImage).not.toHaveBeenCalled();
    expect(uploadImage).toHaveBeenCalledWith(expect.any(Buffer), "image/png", "tenants/1/categories/10");
    expect(categoryRepository.updateImage).toHaveBeenCalledWith(10n, "tenants/1/categories/10/new-public-id");
    expect(result.imageUrl).toContain("tenants/1/categories/10/new-public-id");
  });

  it("destroys the old Cloudinary asset before uploading a replacement", async () => {
    vi.mocked(categoryRepository.findByIdForTenant).mockResolvedValue(
      categoryRow({ imagePublicId: "tenants/1/categories/10/old-public-id" }) as never,
    );
    vi.mocked(categoryRepository.updateImage).mockResolvedValue(
      categoryRow({ imagePublicId: "tenants/1/categories/10/new-public-id" }) as never,
    );

    await categoryService.uploadImage({ tenantId: 1n, categoryId: 10n, file: makeFile("a.png", "image/png", 100) });

    expect(destroyImage).toHaveBeenCalledWith("tenants/1/categories/10/old-public-id");
  });
});

describe("categoryService.removeImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws RESOURCE_NOT_FOUND for a category outside the tenant", async () => {
    vi.mocked(categoryRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(categoryService.removeImage({ tenantId: 1n, categoryId: 999n })).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("is a no-op when the category has no image set", async () => {
    vi.mocked(categoryRepository.findByIdForTenant).mockResolvedValue(categoryRow({ imagePublicId: null }) as never);

    const result = await categoryService.removeImage({ tenantId: 1n, categoryId: 10n });

    expect(destroyImage).not.toHaveBeenCalled();
    expect(categoryRepository.updateImage).not.toHaveBeenCalled();
    expect(result.imageUrl).toBeNull();
  });

  it("destroys the asset and clears the column when an image is set", async () => {
    vi.mocked(categoryRepository.findByIdForTenant).mockResolvedValue(
      categoryRow({ imagePublicId: "tenants/1/categories/10/old-public-id" }) as never,
    );
    vi.mocked(categoryRepository.updateImage).mockResolvedValue(categoryRow({ imagePublicId: null }) as never);

    const result = await categoryService.removeImage({ tenantId: 1n, categoryId: 10n });

    expect(destroyImage).toHaveBeenCalledWith("tenants/1/categories/10/old-public-id");
    expect(categoryRepository.updateImage).toHaveBeenCalledWith(10n, null);
    expect(result.imageUrl).toBeNull();
  });
});
