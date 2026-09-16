import { authRepository } from "../repository/auth.repository";
import { hashPassword, verifyPassword } from "../utils/password.util";
import { signAccessToken, signRefreshToken, verifyToken } from "@/shared/auth/jwt";
import { AppError } from "@/shared/errors/app-error";
import { ACTIVE_TENANT_STATUSES } from "@/shared/constants/tenant-status";
import { rbacLookup } from "@/shared/middleware/rbac-lookup";
import { getActiveSubscription, isSubscriptionExpired } from "@/shared/utils/subscription";
import { cloudinaryImageUrl, CLOUDINARY_TRANSFORM } from "@/shared/utils/cloudinary";
import type { AuthContext } from "@/shared/middleware/with-api-auth";
import type { LoginDto, RefreshDto } from "../dto/auth.dto";
import type { MeView, TokenPair } from "../types/auth.types";

// Same message for "no such tenant", "no such user", "wrong password", and
// a suspended tenant — never let a login failure reveal which of these
// actually failed, or the endpoint becomes a tenant/email enumeration
// oracle. A lapsed *subscription* is deliberately NOT folded into this —
// see the SUBSCRIPTION_EXPIRED branch below, checked only after the
// password has already been verified correct.
const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

export const authService = {
  async login(input: LoginDto): Promise<TokenPair> {
    const user = await authRepository.findActiveUserByEmail(input.email);
    if (!user || user.status !== "ACTIVE") {
      throw new AppError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    }

    if (!user.tenant || !ACTIVE_TENANT_STATUSES.has(user.tenant.status)) {
      throw new AppError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await verifyPassword(input.password, user.password);
    if (!passwordMatches) {
      throw new AppError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    }

    // Checked only now, after the password is confirmed correct: a lapsed
    // plan is a normal lifecycle state the account holder is entitled to
    // know about (so they know to renew), unlike "does this email exist" —
    // revealing it pre-password-check would let an attacker enumerate
    // expired tenants without ever guessing a password; revealing it
    // post-password-check only tells someone who already proved they own
    // the credentials.
    if (isSubscriptionExpired(await getActiveSubscription(user.tenantId))) {
      throw new AppError(
        "SUBSCRIPTION_EXPIRED",
        "Your plan has expired. Please contact your account admin to renew your subscription.",
      );
    }

    if (input.deviceId) {
      await authRepository.recordDeviceLogin({
        tenantId: user.tenantId,
        userId: user.id,
        deviceId: input.deviceId,
      });
    }

    return issueTokenPair(user.id, user.tenantId, user.roleId);
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
    // A plan that has since lapsed by date must lose access immediately
    // too, same reasoning as the tenant.status check just above.
    if (isSubscriptionExpired(await getActiveSubscription(tenantId))) {
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
    const [permissions, enabledFeatures, subscription] = await Promise.all([
      rbacLookup.listPermissionCodesForRole(auth.roleId),
      rbacLookup.listEnabledFeatureCodesForTenant(auth.tenantId),
      getActiveSubscription(auth.tenantId),
    ]);

    const logoUrl = user.tenant.logoPublicId
      ? cloudinaryImageUrl(user.tenant.logoPublicId, CLOUDINARY_TRANSFORM.logo)
      : null;

    const daysUntilRenewal = subscription
      ? Math.ceil((subscription.endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;

    return {
      id: user.id.toString(),
      name: user.name,
      email: user.email,
      tenantId: user.tenantId.toString(),
      tenantLogoUrl: logoUrl,
      tenant: {
        id: user.tenant.id.toString(),
        name: user.tenant.name,
        code: user.tenant.code,
        status: user.tenant.status,
        logoUrl,
        companyName: user.tenant.settings?.companyName ?? null,
        gstNumber: user.tenant.settings?.gstNumber ?? null,
        currency: user.tenant.settings?.currency ?? "INR",
        timezone: user.tenant.settings?.timezone ?? "Asia/Kolkata",
        invoicePrefix: user.tenant.settings?.invoicePrefix ?? null,
        homeState: user.tenant.settings?.homeState ?? null,
        taxInclusivePricing: user.tenant.settings?.taxInclusivePricing ?? false,
        subscriptionEndDate: subscription?.endDate.toISOString() ?? null,
        daysUntilRenewal,
      },
      warehouseId: user.warehouseId?.toString() ?? null,
      warehouseName: user.warehouse?.name ?? null,
      role: { id: user.role.id.toString(), name: user.role.name },
      permissions,
      enabledFeatures,
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
