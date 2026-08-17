import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// Repository and JWT signing are mocked — this is a unit test of the
// service's business rules (which tenant/user states are loginable, that
// every failure path returns the same generic error), not an integration
// test against a real database. See Docs/CONTRIBUTING.md -> Code Review
// Checklist and MODULES.md -> tests/.
vi.mock("../repository/auth.repository", () => ({
  authRepository: {
    findTenantByCode: vi.fn(),
    findTenantById: vi.fn(),
    findActiveUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    findUserWithRoleById: vi.fn(),
  },
}));

vi.mock("@/shared/auth/jwt", () => ({
  signAccessToken: vi.fn(() => "access-token"),
  signRefreshToken: vi.fn(() => "refresh-token"),
  verifyToken: vi.fn(),
}));

vi.mock("@/shared/middleware/rbac-lookup", () => ({
  rbacLookup: {
    listPermissionCodesForRole: vi.fn(),
    listEnabledFeatureCodesForTenant: vi.fn(),
  },
}));

import { authRepository } from "../repository/auth.repository";
import { verifyToken } from "@/shared/auth/jwt";
import { rbacLookup } from "@/shared/middleware/rbac-lookup";
import { authService } from "../service/auth.service";

const TEST_PASSWORD = "Password123";
// Low bcrypt cost (4) only to keep the test fast — production hashing
// still uses SALT_ROUNDS = 12 in password.util.ts.
const TEST_PASSWORD_HASH = await bcrypt.hash(TEST_PASSWORD, 4);

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 10n,
    tenantId: 1n,
    roleId: 2n,
    status: "ACTIVE",
    password: TEST_PASSWORD_HASH,
    tenant: { id: 1n, status: "ACTIVE" },
    ...overrides,
  };
}

describe("authService.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a token pair for valid credentials", async () => {
    vi.mocked(authRepository.findActiveUserByEmail).mockResolvedValue(activeUser() as never);

    const result = await authService.login({
      email: "user@acme.com",
      password: TEST_PASSWORD,
    });

    expect(result).toEqual({ accessToken: "access-token", refreshToken: "refresh-token" });
  });

  it("rejects an unknown user with generic error", async () => {
    vi.mocked(authRepository.findActiveUserByEmail).mockResolvedValue(null);

    await expect(
      authService.login({ email: "missing@x.com", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("rejects a suspended tenant associated with user even with correct credentials", async () => {
    vi.mocked(authRepository.findActiveUserByEmail).mockResolvedValue(
      activeUser({ tenant: { id: 1n, status: "SUSPENDED" } }) as never,
    );

    await expect(
      authService.login({ email: "user@acme.com", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("rejects a wrong password with the same code as an unknown user", async () => {
    vi.mocked(authRepository.findActiveUserByEmail).mockResolvedValue(activeUser() as never);

    await expect(
      authService.login({ email: "user@acme.com", password: "wrong-password" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("rejects an inactive user", async () => {
    vi.mocked(authRepository.findActiveUserByEmail).mockResolvedValue(
      activeUser({ status: "INVITED" }) as never,
    );

    await expect(
      authService.login({ email: "user@acme.com", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});

describe("authService.refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-validates current tenant/user state rather than trusting the token alone", async () => {
    vi.mocked(verifyToken).mockReturnValue({ sub: "10", tenantId: "1", roleId: "2" });
    vi.mocked(authRepository.findTenantById).mockResolvedValue({ id: 1n, status: "ACTIVE" } as never);
    vi.mocked(authRepository.findUserById).mockResolvedValue(activeUser() as never);

    const result = await authService.refresh({ refreshToken: "some-refresh-token" });

    expect(result).toEqual({ accessToken: "access-token", refreshToken: "refresh-token" });
  });

  it("rejects refresh for a user deactivated after the token was issued", async () => {
    vi.mocked(verifyToken).mockReturnValue({ sub: "10", tenantId: "1", roleId: "2" });
    vi.mocked(authRepository.findTenantById).mockResolvedValue({ id: 1n, status: "ACTIVE" } as never);
    vi.mocked(authRepository.findUserById).mockResolvedValue(
      activeUser({ status: "INACTIVE" }) as never,
    );

    await expect(authService.refresh({ refreshToken: "some-refresh-token" })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("rejects refresh for a tenant suspended after the token was issued", async () => {
    vi.mocked(verifyToken).mockReturnValue({ sub: "10", tenantId: "1", roleId: "2" });
    vi.mocked(authRepository.findTenantById).mockResolvedValue(
      { id: 1n, status: "SUSPENDED" } as never,
    );

    await expect(authService.refresh({ refreshToken: "some-refresh-token" })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});

describe("authService.me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the caller's identity and effective permission list", async () => {
    vi.mocked(authRepository.findUserWithRoleById).mockResolvedValue({
      id: 10n,
      tenantId: 1n,
      name: "Admin User",
      email: "admin@acme.com",
      warehouseId: null,
      warehouse: null,
      role: { id: 2n, name: "Admin" },
      tenant: {
        id: 1n,
        name: "Acme Corp",
        code: "acme",
        status: "ACTIVE",
        logoPublicId: null,
        settings: {
          companyName: "Acme Inc",
          gstNumber: "27AAAAA0000A1Z5",
          currency: "INR",
          timezone: "Asia/Kolkata",
          invoicePrefix: "INV-",
          homeState: "Maharashtra",
          taxInclusivePricing: false,
        },
      },
    } as never);
    vi.mocked(rbacLookup.listPermissionCodesForRole).mockResolvedValue([
      "PRODUCT.VIEW",
      "PRODUCT.CREATE",
    ]);
    vi.mocked(rbacLookup.listEnabledFeatureCodesForTenant).mockResolvedValue(["PRODUCT"]);

    const result = await authService.me({ userId: 10n, tenantId: 1n, roleId: 2n, warehouseId: null });

    expect(result).toEqual({
      id: "10",
      name: "Admin User",
      email: "admin@acme.com",
      tenantId: "1",
      tenantLogoUrl: null,
      tenant: {
        id: "1",
        name: "Acme Corp",
        code: "acme",
        status: "ACTIVE",
        logoUrl: null,
        companyName: "Acme Inc",
        gstNumber: "27AAAAA0000A1Z5",
        currency: "INR",
        timezone: "Asia/Kolkata",
        invoicePrefix: "INV-",
        homeState: "Maharashtra",
        taxInclusivePricing: false,
      },
      warehouseId: null,
      warehouseName: null,
      role: { id: "2", name: "Admin" },
      permissions: ["PRODUCT.VIEW", "PRODUCT.CREATE"],
      enabledFeatures: ["PRODUCT"],
    });
  });

  it("returns the caller's own warehouse scope when restricted to one store", async () => {
    vi.mocked(authRepository.findUserWithRoleById).mockResolvedValue({
      id: 10n,
      tenantId: 1n,
      name: "Store Manager",
      email: "manager@acme.com",
      warehouseId: 5n,
      warehouse: { id: 5n, name: "Downtown Store" },
      role: { id: 2n, name: "Store Manager" },
      tenant: { id: 1n, name: "Acme Corp", code: "acme", status: "ACTIVE", logoPublicId: null },
    } as never);
    vi.mocked(rbacLookup.listPermissionCodesForRole).mockResolvedValue(["SALE.VIEW"]);

    const result = await authService.me({ userId: 10n, tenantId: 1n, roleId: 2n, warehouseId: 5n });

    expect(result.warehouseId).toBe("5");
    expect(result.warehouseName).toBe("Downtown Store");
    expect(result.tenant.name).toBe("Acme Corp");
  });

  it("builds a Cloudinary URL for the tenant's logo when one is set", async () => {
    vi.mocked(authRepository.findUserWithRoleById).mockResolvedValue({
      id: 10n,
      tenantId: 1n,
      name: "Admin User",
      email: "admin@acme.com",
      role: { id: 2n, name: "Admin" },
      tenant: { id: 1n, name: "Acme Corp", code: "acme", status: "ACTIVE", logoPublicId: "tenants/1/logo/abc" },
    } as never);
    vi.mocked(rbacLookup.listPermissionCodesForRole).mockResolvedValue([]);

    const result = await authService.me({ userId: 10n, tenantId: 1n, roleId: 2n, warehouseId: null });

    expect(result.tenantLogoUrl).toContain("tenants/1/logo/abc");
    expect(result.tenant.logoUrl).toContain("tenants/1/logo/abc");
  });

  it("rejects when the user no longer exists (deleted after the token was issued)", async () => {
    vi.mocked(authRepository.findUserWithRoleById).mockResolvedValue(null);

    await expect(authService.me({ userId: 10n, tenantId: 1n, roleId: 2n, warehouseId: null })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(rbacLookup.listPermissionCodesForRole).not.toHaveBeenCalled();
  });
});
