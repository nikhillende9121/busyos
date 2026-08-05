import type { NextRequest } from "next/server";
import { verifySuperAdminToken } from "@/shared/auth/jwt";
import { AppError } from "@/shared/errors/app-error";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { prisma } from "@/shared/database/prisma";

// The Super Admin request pipeline — deliberately much shorter than
// with-api-auth.ts's: no tenant/subscription/feature/permission steps,
// since a Super Admin isn't tenant-scoped at all (see prisma/schema.prisma's
// SuperAdmin model, Docs/business-rules/roles-and-permissions.md ->
// Super Admin). Being an active Super Admin at all is the only gate in v1
// — no finer-grained roles among platform staff yet.
export type SuperAdminAuthContext = {
  superAdminId: bigint;
};

export type SuperAdminApiHandler<TParams> = (
  request: NextRequest,
  auth: SuperAdminAuthContext,
  params: TParams,
) => Promise<Response>;

const BEARER_PREFIX = "Bearer ";

export function withSuperAdminAuth<TParams = Record<string, never>>(handler: SuperAdminApiHandler<TParams>) {
  return async (
    request: NextRequest,
    routeContext: { params: Promise<TParams> },
  ): Promise<Response> => {
    let auth: SuperAdminAuthContext;
    try {
      auth = await runPipeline(request);
    } catch (error) {
      return handleRouteError(error);
    }

    const params = await routeContext.params;
    return handler(request, auth, params);
  };
}

async function runPipeline(request: NextRequest): Promise<SuperAdminAuthContext> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith(BEARER_PREFIX) ? authHeader.slice(BEARER_PREFIX.length) : null;
  if (!token) {
    throw new AppError("UNAUTHENTICATED", "Missing bearer token");
  }
  const claims = verifySuperAdminToken(token);
  const superAdminId = BigInt(claims.sub);

  // Re-checked fresh from the database, not trusted from the token alone —
  // same reasoning as the tenant pipeline: a deactivated Super Admin must
  // lose access immediately, not just after their token naturally expires.
  const superAdmin = await prisma.superAdmin.findUnique({ where: { id: superAdminId } });
  if (!superAdmin || superAdmin.status !== "ACTIVE") {
    throw new AppError("UNAUTHENTICATED", "Session is no longer valid");
  }

  return { superAdminId };
}
