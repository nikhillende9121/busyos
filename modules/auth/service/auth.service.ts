import { authRepository } from "../repository/auth.repository";
import { hashPassword, verifyPassword } from "../utils/password.util";
import { signAccessToken, signRefreshToken, verifyToken } from "@/shared/auth/jwt";
import { AppError } from "@/shared/errors/app-error";
import { ACTIVE_TENANT_STATUSES } from "@/shared/constants/tenant-status";
import { rbacLookup } from "@/shared/middleware/rbac-lookup";
import { cloudinaryImageUrl, CLOUDINARY_TRANSFORM } from "@/shared/utils/cloudinary";
import type { AuthContext } from "@/shared/middleware/with-api-auth";
import type { LoginDto, RefreshDto } from "../dto/auth.dto";
import type { MeView, TokenPair } from "../types/auth.types";

// Same message for "no such tenant", "no such user", and "wrong password" —
// never let a login failure reveal which of the three actually failed, or
// the endpoint becomes a tenant/email enumeration oracle.
const INVALID_CREDENTIALS_MESSAGE = "Invalid tenant, email, or password";

export const authService = {
  async login(input: LoginDto): Promise<TokenPair> {
    const tenant = await authRepository.findTenantByCode(input.tenantCode);
    if (!tenant || !ACTIVE_TENANT_STATUSES.has(tenant.status)) {
      throw new AppError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    }

    const user = await authRepository.findActiveUserByEmail(tenant.id, input.email);
    if (!user || user.status !== "ACTIVE") {
      throw new AppError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await verifyPassword(input.password, user.password);
    if (!passwordMatches) {
      throw new AppError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    }

    // TODO: audit log successful login (see AI_AGENT.md -> Logging) once
    // shared/logger exists.
    return issueTokenPair(user.id, tenant.id, user.roleId);
  },

  async refresh(input: RefreshDto): Promise<TokenPair> {
    const claims = verifyToken(input.refreshToken);
    const tenantId = BigInt(claims.tenantId);
    const userId = BigInt(claims.sub);

    // Re-check current state from the database rather than trusting the old
    // token's claims — a user deactivated or a tenant suspended after the
    // refresh token was issued must lose access immediately, not just after
    // the (long-lived) refresh token itself expires.
    const tenant = await authRepository.findTenantById(tenantId);
    if (!tenant || !ACTIVE_TENANT_STATUSES.has(tenant.status)) {
      throw new AppError("UNAUTHENTICATED", "Session is no longer valid");
    }

    const user = await authRepository.findUserById(tenantId, userId);
    if (!user || user.status !== "ACTIVE") {
      throw new AppError("UNAUTHENTICATED", "Session is no longer valid");
    }

    return issueTokenPair(user.id, tenant.id, user.roleId);
  },

  // Backs GET /api/v1/auth/me — the dashboard's only way to learn the
  // caller's identity and effective permission set, since neither is
  // embedded in the JWT (permissions are checked DB-fresh on every request,
  // see rbac-lookup.ts).
  async me(auth: AuthContext): Promise<MeView> {
    const user = await authRepository.findUserWithRoleById(auth.tenantId, auth.userId);
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Session is no longer valid");
    }
    const permissions = await rbacLookup.listPermissionCodesForRole(auth.roleId);

    return {
      id: user.id.toString(),
      name: user.name,
      email: user.email,
      tenantId: user.tenantId.toString(),
      tenantLogoUrl: user.tenant.logoPublicId
        ? cloudinaryImageUrl(user.tenant.logoPublicId, CLOUDINARY_TRANSFORM.logo)
        : null,
      warehouseId: user.warehouseId?.toString() ?? null,
      warehouseName: user.warehouse?.name ?? null,
      role: { id: user.role.id.toString(), name: user.role.name },
      permissions,
    };
  },
};

function issueTokenPair(userId: bigint, tenantId: bigint, roleId: bigint): TokenPair {
  const claims = {
    sub: userId.toString(),
    tenantId: tenantId.toString(),
    roleId: roleId.toString(),
  };
  return {
    accessToken: signAccessToken(claims),
    refreshToken: signRefreshToken(claims),
  };
}

// Exported for the (future) user-management module's "create user" flow to
// reuse — password hashing is an auth concern, not duplicated per module.
export { hashPassword };
