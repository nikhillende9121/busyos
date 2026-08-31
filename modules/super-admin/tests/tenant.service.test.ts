import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/shared/database/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback("tenant-tx")),
  },
}));

vi.mock("../repository/tenant.repository", () => ({
  superAdminTenantRepository: {
    findMany: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    updateLogo: vi.fn(),
    createSetting: vi.fn(),
    findPlanById: vi.fn(),
    createSubscription: vi.fn(),
    enableFeatures: vi.fn(),
    findActiveSubscription: vi.fn(),
    findTenantIdsOnPlan: vi.fn(),
    findEnabledFeatureIds: vi.fn(),
    setFeatureEnabled: vi.fn(),
  },
}));

vi.mock("@/modules/role/service/role.service", () => ({
  roleService: {
    listPermissionCatalog: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/modules/user/service/user.service", () => ({
  userService: {
    create: vi.fn(),
  },
}));

vi.mock("@/shared/utils/cloudinary", () => ({
  uploadImage: vi.fn(),
  destroyImage: vi.fn(),
  cloudinaryImageUrl: (publicId: string, transform: string) => `https://cdn.test/${transform}/${publicId}`,
  CLOUDINARY_TRANSFORM: { thumbnail: "thumb", full: "full", logo: "logo" },
}));

import { superAdminTenantRepository } from "../repository/tenant.repository";
import { roleService } from "@/modules/role/service/role.service";
import { userService } from "@/modules/user/service/user.service";
import { uploadImage, destroyImage } from "@/shared/utils/cloudinary";
import { superAdminTenantService } from "../service/tenant.service";

function tenantRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5n,
    name: "Acme Retail",
    code: "acme",
    status: "TRIAL",
    logoPublicId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("superAdminTenantService.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(superAdminTenantRepository.findPlanById).mockResolvedValue({
      id: 1n,
      price: new Prisma.Decimal("999.00"),
      planFeatures: [{ featureId: 10n }],
    } as never);
    vi.mocked(superAdminTenantRepository.create).mockResolvedValue(tenantRow() as never);
    vi.mocked(roleService.listPermissionCatalog).mockResolvedValue([
      { code: "PRODUCT.VIEW", module: "PRODUCT", action: "VIEW" },
    ] as never);
    vi.mocked(roleService.create).mockResolvedValue({ id: "20", permissions: ["PRODUCT.VIEW"] } as never);
    vi.mocked(userService.create).mockResolvedValue({ id: "30" } as never);
  });

  it("rejects an unknown planId before creating anything", async () => {
    vi.mocked(superAdminTenantRepository.findPlanById).mockResolvedValue(null);

    await expect(
      superAdminTenantService.create({
        name: "Acme Retail",
        code: "acme",
        planId: 999n,
        adminName: "Admin",
        adminEmail: "admin@acme.test",
        adminPassword: "Password123!",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(superAdminTenantRepository.create).not.toHaveBeenCalled();
  });

  it("bootstraps the tenant's TenantSetting/Subscription/Features, then an Admin role with every permission, then the admin user", async () => {
    const result = await superAdminTenantService.create({
      name: "Acme Retail",
      code: "acme",
      planId: 1n,
      adminName: "Admin",
      adminEmail: "admin@acme.test",
      adminPassword: "Password123!",
    });

    expect(result).toMatchObject({ id: "5", code: "acme", status: "TRIAL" });
    expect(superAdminTenantRepository.createSetting).toHaveBeenCalledWith(
      "tenant-tx",
      expect.objectContaining({ tenantId: 5n }),
    );
    expect(superAdminTenantRepository.createSubscription).toHaveBeenCalledWith(
      "tenant-tx",
      expect.objectContaining({ tenantId: 5n, planId: 1n, priceAtSigning: new Prisma.Decimal("999.00") }),
    );
    expect(superAdminTenantRepository.enableFeatures).toHaveBeenCalledWith("tenant-tx", 5n, [10n]);
    expect(roleService.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 5n, code: "ADMIN", permissionCodes: ["PRODUCT.VIEW"] }),
    );
    expect(userService.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 5n, roleId: 20n, email: "admin@acme.test" }),
    );
  });

  it("maps a duplicate tenant code to DUPLICATE_CODE", async () => {
    vi.mocked(superAdminTenantRepository.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "test" }),
    );

    await expect(
      superAdminTenantService.create({
        name: "Acme Retail",
        code: "acme",
        planId: 1n,
        adminName: "Admin",
        adminEmail: "admin@acme.test",
        adminPassword: "Password123!",
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_CODE" });
    expect(roleService.create).not.toHaveBeenCalled();
  });
});

describe("superAdminTenantService.updateStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects updating a tenant that doesn't exist", async () => {
    vi.mocked(superAdminTenantRepository.findById).mockResolvedValue(null);

    await expect(superAdminTenantService.updateStatus({ tenantId: 999n, status: "SUSPENDED" })).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("updates an existing tenant's status", async () => {
    vi.mocked(superAdminTenantRepository.findById).mockResolvedValue(tenantRow() as never);
    vi.mocked(superAdminTenantRepository.updateStatus).mockResolvedValue(tenantRow({ status: "SUSPENDED" }) as never);

    const result = await superAdminTenantService.updateStatus({ tenantId: 5n, status: "SUSPENDED" });

    expect(result.status).toBe("SUSPENDED");
  });
});

describe("superAdminTenantService.uploadLogo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(uploadImage).mockResolvedValue("tenants/5/logo/new-public-id");
  });

  it("throws RESOURCE_NOT_FOUND for a tenant that doesn't exist", async () => {
    vi.mocked(superAdminTenantRepository.findById).mockResolvedValue(null);

    await expect(
      superAdminTenantService.uploadLogo({ tenantId: 999n, file: makeFile("logo.png", "image/png", 100) }),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("rejects an unsupported mime type", async () => {
    vi.mocked(superAdminTenantRepository.findById).mockResolvedValue(tenantRow() as never);

    await expect(
      superAdminTenantService.uploadLogo({ tenantId: 5n, file: makeFile("logo.pdf", "application/pdf", 100) }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("rejects a file over the 5MB limit", async () => {
    vi.mocked(superAdminTenantRepository.findById).mockResolvedValue(tenantRow() as never);

    await expect(
      superAdminTenantService.uploadLogo({
        tenantId: 5n,
        file: makeFile("logo.png", "image/png", 6 * 1024 * 1024),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("uploads and persists a logo when the tenant has none yet", async () => {
    vi.mocked(superAdminTenantRepository.findById).mockResolvedValue(tenantRow({ logoPublicId: null }) as never);
    vi.mocked(superAdminTenantRepository.updateLogo).mockResolvedValue(
      tenantRow({ logoPublicId: "tenants/5/logo/new-public-id" }) as never,
    );

    const result = await superAdminTenantService.uploadLogo({
      tenantId: 5n,
      file: makeFile("logo.png", "image/png", 100),
    });

    expect(destroyImage).not.toHaveBeenCalled();
    expect(uploadImage).toHaveBeenCalledWith(expect.any(Buffer), "image/png", "tenants/5/logo");
    expect(superAdminTenantRepository.updateLogo).toHaveBeenCalledWith(5n, "tenants/5/logo/new-public-id");
    expect(result.logoUrl).toContain("tenants/5/logo/new-public-id");
  });

  it("destroys the old Cloudinary asset before uploading a replacement", async () => {
    vi.mocked(superAdminTenantRepository.findById).mockResolvedValue(
      tenantRow({ logoPublicId: "tenants/5/logo/old-public-id" }) as never,
    );
    vi.mocked(superAdminTenantRepository.updateLogo).mockResolvedValue(
      tenantRow({ logoPublicId: "tenants/5/logo/new-public-id" }) as never,
    );

    await superAdminTenantService.uploadLogo({ tenantId: 5n, file: makeFile("logo.png", "image/png", 100) });

    expect(destroyImage).toHaveBeenCalledWith("tenants/5/logo/old-public-id");
  });
});

describe("superAdminTenantService.resyncFeatures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does nothing when the tenant has no active/trial subscription", async () => {
    vi.mocked(superAdminTenantRepository.findActiveSubscription).mockResolvedValue(null);

    await superAdminTenantService.resyncFeatures(5n);

    expect(superAdminTenantRepository.setFeatureEnabled).not.toHaveBeenCalled();
  });

  it("enables features the plan grants and disables ones it no longer does", async () => {
    vi.mocked(superAdminTenantRepository.findActiveSubscription).mockResolvedValue({
      id: 1n,
      plan: { planFeatures: [{ featureId: 10n }, { featureId: 20n }] },
    } as never);
    vi.mocked(superAdminTenantRepository.findEnabledFeatureIds).mockResolvedValue([{ featureId: 20n }, { featureId: 30n }]);

    await superAdminTenantService.resyncFeatures(5n);

    // 10: newly granted by the plan, wasn't enabled -> enable
    expect(superAdminTenantRepository.setFeatureEnabled).toHaveBeenCalledWith(expect.anything(), 5n, 10n, true);
    // 20: granted and already enabled -> stays enabled
    expect(superAdminTenantRepository.setFeatureEnabled).toHaveBeenCalledWith(expect.anything(), 5n, 20n, true);
    // 30: currently enabled but the plan no longer grants it -> disable
    expect(superAdminTenantRepository.setFeatureEnabled).toHaveBeenCalledWith(expect.anything(), 5n, 30n, false);
  });
});

describe("superAdminTenantService.removeLogo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws RESOURCE_NOT_FOUND for a tenant that doesn't exist", async () => {
    vi.mocked(superAdminTenantRepository.findById).mockResolvedValue(null);

    await expect(superAdminTenantService.removeLogo({ tenantId: 999n })).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("is a no-op when the tenant has no logo set", async () => {
    vi.mocked(superAdminTenantRepository.findById).mockResolvedValue(tenantRow({ logoPublicId: null }) as never);

    const result = await superAdminTenantService.removeLogo({ tenantId: 5n });

    expect(destroyImage).not.toHaveBeenCalled();
    expect(superAdminTenantRepository.updateLogo).not.toHaveBeenCalled();
    expect(result.logoUrl).toBeNull();
  });

  it("destroys the asset and clears the column when a logo is set", async () => {
    vi.mocked(superAdminTenantRepository.findById).mockResolvedValue(
      tenantRow({ logoPublicId: "tenants/5/logo/old-public-id" }) as never,
    );
    vi.mocked(superAdminTenantRepository.updateLogo).mockResolvedValue(tenantRow({ logoPublicId: null }) as never);

    const result = await superAdminTenantService.removeLogo({ tenantId: 5n });

    expect(destroyImage).toHaveBeenCalledWith("tenants/5/logo/old-public-id");
    expect(superAdminTenantRepository.updateLogo).toHaveBeenCalledWith(5n, null);
    expect(result.logoUrl).toBeNull();
  });
});
