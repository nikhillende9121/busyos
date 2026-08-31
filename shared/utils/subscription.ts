import { prisma } from "@/shared/database/prisma";
import type { TenantSubscription } from "@prisma/client";

// A tenant's most recent ACTIVE/TRIAL subscription — same query shape as
// shared/utils/plan-limits.ts's getActivePlanLimits(). No subscription on
// record at all means "don't block" (a tenant mid-onboarding, created
// before superAdminTenantService.create finishes opening a subscription,
// must never be penalized by a check with nothing to compare against yet).
export function getActiveSubscription(tenantId: bigint): Promise<TenantSubscription | null> {
  return prisma.tenantSubscription.findFirst({
    where: { tenantId, status: { in: ["ACTIVE", "TRIAL"] } },
    orderBy: { createdAt: "desc" },
  });
}

// Live date comparison only — never flips TenantSubscription.status or
// Tenant.status itself. See modules/auth/service/auth.service.ts (login/
// refresh) and shared/middleware/with-api-auth.ts for the enforcement
// points that call this.
export function isSubscriptionExpired(subscription: { endDate: Date } | null): boolean {
  return subscription !== null && subscription.endDate.getTime() < Date.now();
}
