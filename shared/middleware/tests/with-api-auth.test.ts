import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/shared/auth/jwt", () => ({
  verifyToken: vi.fn(),
}));

vi.mock("../rbac-lookup", () => ({
  rbacLookup: {
    findTenantById: vi.fn(),
    isFeatureEnabledForTenant: vi.fn(),
    roleHasPermission: vi.fn(),
    findUserWarehouseScope: vi.fn(),
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

import { verifyToken } from "@/shared/auth/jwt";
import { rbacLookup } from "../rbac-lookup";
import { getActiveSubscription } from "@/shared/utils/subscription";
import { withApiAuth } from "../with-api-auth";

function requestWithAuthHeader(authorization?: string): NextRequest {
  return {
    headers: new Headers(authorization ? { authorization } : {}),
  } as unknown as NextRequest;
}

const VALID_CLAIMS = { sub: "10", tenantId: "1", roleId: "2" };

async function statusOf(response: Response) {
  const body = await response.json();
  return { status: response.status, body };
}

describe("withApiAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rbacLookup.findTenantById).mockResolvedValue({ id: 1n, status: "ACTIVE" } as never);
    vi.mocked(rbacLookup.findUserWarehouseScope).mockResolvedValue(null);
    vi.mocked(getActiveSubscription).mockResolvedValue(null);
  });

  it("rejects a request with no bearer token before touching the database", async () => {
    const wrapped = withApiAuth(async () => new Response("ok"));

    const response = await wrapped(requestWithAuthHeader(undefined), { params: Promise.resolve({}) });
    const { status, body } = await statusOf(response);

    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(rbacLookup.findTenantById).not.toHaveBeenCalled();
  });

  it("rejects a suspended tenant before checking feature/permission", async () => {
    vi.mocked(verifyToken).mockReturnValue(VALID_CLAIMS);
    vi.mocked(rbacLookup.findTenantById).mockResolvedValue({ id: 1n, status: "SUSPENDED" } as never);
    const wrapped = withApiAuth(async () => new Response("ok"), {
      feature: "INVENTORY",
      permission: "INVENTORY.ADJUST",
    });

    const { status, body } = await statusOf(
      await wrapped(requestWithAuthHeader("Bearer token"), { params: Promise.resolve({}) }),
    );

    expect(status).toBe(403);
    expect(body.error.code).toBe("SUBSCRIPTION_EXPIRED");
    expect(rbacLookup.isFeatureEnabledForTenant).not.toHaveBeenCalled();
    expect(rbacLookup.roleHasPermission).not.toHaveBeenCalled();
  });

  it("rejects a tenant whose subscription has expired by date, even with an ACTIVE status", async () => {
    vi.mocked(verifyToken).mockReturnValue(VALID_CLAIMS);
    vi.mocked(getActiveSubscription).mockResolvedValue({ endDate: new Date("2020-01-01") } as never);
    const wrapped = withApiAuth(async () => new Response("ok"), {
      feature: "INVENTORY",
      permission: "INVENTORY.ADJUST",
    });

    const { status, body } = await statusOf(
      await wrapped(requestWithAuthHeader("Bearer token"), { params: Promise.resolve({}) }),
    );

    expect(status).toBe(403);
    expect(body.error.code).toBe("SUBSCRIPTION_EXPIRED");
    expect(rbacLookup.isFeatureEnabledForTenant).not.toHaveBeenCalled();
    expect(rbacLookup.roleHasPermission).not.toHaveBeenCalled();
  });

  it("rejects a disabled feature before checking permission", async () => {
    vi.mocked(verifyToken).mockReturnValue(VALID_CLAIMS);
    vi.mocked(rbacLookup.isFeatureEnabledForTenant).mockResolvedValue(false);
    const wrapped = withApiAuth(async () => new Response("ok"), {
      feature: "INVENTORY",
      permission: "INVENTORY.ADJUST",
    });

    const { status, body } = await statusOf(
      await wrapped(requestWithAuthHeader("Bearer token"), { params: Promise.resolve({}) }),
    );

    expect(status).toBe(403);
    expect(body.error.code).toBe("FEATURE_NOT_ENABLED");
    expect(rbacLookup.roleHasPermission).not.toHaveBeenCalled();
  });

  it("rejects a role missing the required permission", async () => {
    vi.mocked(verifyToken).mockReturnValue(VALID_CLAIMS);
    vi.mocked(rbacLookup.isFeatureEnabledForTenant).mockResolvedValue(true);
    vi.mocked(rbacLookup.roleHasPermission).mockResolvedValue(false);
    const wrapped = withApiAuth(async () => new Response("ok"), {
      feature: "INVENTORY",
      permission: "INVENTORY.ADJUST",
    });

    const { status, body } = await statusOf(
      await wrapped(requestWithAuthHeader("Bearer token"), { params: Promise.resolve({}) }),
    );

    expect(status).toBe(403);
    expect(body.error.code).toBe("PERMISSION_DENIED");
  });

  it("calls the handler with a bigint auth context and the resolved params when every check passes", async () => {
    vi.mocked(verifyToken).mockReturnValue(VALID_CLAIMS);
    vi.mocked(rbacLookup.isFeatureEnabledForTenant).mockResolvedValue(true);
    vi.mocked(rbacLookup.roleHasPermission).mockResolvedValue(true);

    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withApiAuth<{ id: string }>(handler, {
      feature: "INVENTORY",
      permission: "INVENTORY.ADJUST",
    });

    await wrapped(requestWithAuthHeader("Bearer token"), {
      params: Promise.resolve({ id: "42" }),
    });

    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 10n, tenantId: 1n, roleId: 2n, warehouseId: null },
      { id: "42" },
    );
  });

  it("populates a non-null warehouseId when the user is scoped to one warehouse", async () => {
    vi.mocked(verifyToken).mockReturnValue(VALID_CLAIMS);
    vi.mocked(rbacLookup.isFeatureEnabledForTenant).mockResolvedValue(true);
    vi.mocked(rbacLookup.roleHasPermission).mockResolvedValue(true);
    vi.mocked(rbacLookup.findUserWarehouseScope).mockResolvedValue(5n);

    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withApiAuth(handler, { feature: "INVENTORY", permission: "INVENTORY.ADJUST" });

    await wrapped(requestWithAuthHeader("Bearer token"), { params: Promise.resolve({}) });

    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 10n, tenantId: 1n, roleId: 2n, warehouseId: 5n },
      {},
    );
  });

  it("skips feature/permission checks entirely when a route doesn't declare them", async () => {
    vi.mocked(verifyToken).mockReturnValue(VALID_CLAIMS);
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withApiAuth(handler);

    await wrapped(requestWithAuthHeader("Bearer token"), { params: Promise.resolve({}) });

    expect(handler).toHaveBeenCalled();
    expect(rbacLookup.isFeatureEnabledForTenant).not.toHaveBeenCalled();
    expect(rbacLookup.roleHasPermission).not.toHaveBeenCalled();
  });
});
