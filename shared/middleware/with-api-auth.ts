import type { NextRequest } from "next/server";
import { verifyToken } from "@/shared/auth/jwt";
import { AppError } from "@/shared/errors/app-error";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { ACTIVE_TENANT_STATUSES } from "@/shared/constants/tenant-status";
import { getActiveSubscription, isSubscriptionExpired } from "@/shared/utils/subscription";
import { rbacLookup } from "./rbac-lookup";

// The Request Pipeline every protected route runs through, in this exact
// order — see Docs/ARCHITECTURE.md -> Request Pipeline:
//   Authentication -> Resolve Tenant -> Subscription Validation
//   -> Feature Validation -> Permission Validation -> (route's own handler)
//
// Implemented as a per-route wrapper, not a global proxy.ts: Next.js 16
// renamed middleware to Proxy and explicitly recommends against relying on
// it alone for auth ("verify authentication and authorization inside each
// Server Function") — see node_modules/next/dist/docs/.../proxy.md. A
// wrapper called explicitly by each route also lets each one declare its
// own feature/permission requirement, which a single global file can't do
// without hardcoding a route-to-permission map.
export type AuthContext = {
  userId: bigint;
  tenantId: bigint;
  roleId: bigint;
  // null = unrestricted; set = this caller may only act on this one
  // warehouse — see shared/utils/assert-warehouse-access.ts and
  // Docs/business-rules/roles-and-permissions.md -> Warehouse-Scoped Users.
  warehouseId: bigint | null;
};

export type ApiHandler<TParams> = (
  request: NextRequest,
  auth: AuthContext,
  params: TParams,
) => Promise<Response>;

export type WithApiAuthOptions = {
  /** Feature code the tenant's plan must have enabled, e.g. "INVENTORY". Omit if the route isn't feature-gated. */
  feature?: string;
  /** Permission code the caller's role must hold, e.g. "PRODUCT.CREATE". Omit if the route only requires authentication. */
  permission?: string;
};

const BEARER_PREFIX = "Bearer ";

export function withApiAuth<TParams = Record<string, never>>(
  handler: ApiHandler<TParams>,
  options: WithApiAuthOptions = {},
) {
  return async (
    request: NextRequest,
    routeContext: { params: Promise<TParams> },
  ): Promise<Response> => {
    let auth: AuthContext;
    try {
      auth = await runPipeline(request, options);
    } catch (error) {
      return handleRouteError(error);
    }

    const params = await routeContext.params;
    // Deliberately outside the try/catch above: business-logic errors from
    // here on are the calling controller's own responsibility to catch and
    // map via handleRouteError, same as the public (unauthenticated) routes
    // in modules/auth/controller/auth.controller.ts. Catching them here too
    // would just be a second, redundant error boundary.
    return handler(request, auth, params);
  };
}

async function runPipeline(
  request: NextRequest,
  options: WithApiAuthOptions,
): Promise<AuthContext> {
  // 1. Authentication
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith(BEARER_PREFIX)
    ? authHeader.slice(BEARER_PREFIX.length)
    : null;
  if (!token) {
    throw new AppError("UNAUTHENTICATED", "Missing bearer token");
  }
  const claims = verifyToken(token);
  const tenantId = BigInt(claims.tenantId);
  const userId = BigInt(claims.sub);
  const roleId = BigInt(claims.roleId);

  // 2. Resolve Tenant + 3. Subscription Validation
  const tenant = await rbacLookup.findTenantById(tenantId);
  if (!tenant || !ACTIVE_TENANT_STATUSES.has(tenant.status)) {
    throw new AppError("SUBSCRIPTION_EXPIRED", "This tenant's account is not active");
  }
  // A tenant can stay Tenant.status ACTIVE indefinitely (nothing flips it
  // automatically) while its TenantSubscription.endDate has already
  // passed — this is what actually cuts off an already-logged-in session
  // on its next request once the plan lapses by date, not just new logins.
  if (isSubscriptionExpired(await getActiveSubscription(tenantId))) {
    throw new AppError("SUBSCRIPTION_EXPIRED", "This tenant's account is not active");
  }

  // 4. Feature Validation — checked before Permission, per AI_AGENT.md:
  // "Feature access is checked first. Permission access is checked second."
  if (options.feature) {
    const enabled = await rbacLookup.isFeatureEnabledForTenant(tenantId, options.feature);
    if (!enabled) {
      throw new AppError(
        "FEATURE_NOT_ENABLED",
        `Feature "${options.feature}" is not enabled for this tenant`,
      );
    }
  }

  // 5. Permission Validation
  if (options.permission) {
    const allowed = await rbacLookup.roleHasPermission(roleId, options.permission);
    if (!allowed) {
      throw new AppError("PERMISSION_DENIED", `Missing permission "${options.permission}"`);
    }
  }

  const warehouseId = await rbacLookup.findUserWarehouseScope(userId);

  return { userId, tenantId, roleId, warehouseId };
}
