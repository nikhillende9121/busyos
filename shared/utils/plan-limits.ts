import { prisma } from "@/shared/database/prisma";

export type PlanLimits = { maxWarehouses: number | null; maxUsers: number | null };

// A tenant's most recent ACTIVE/TRIAL subscription determines its current
// plan limits (null on either field means unlimited). No subscription on
// record at all also means unlimited — a tenant mid-onboarding (its first
// warehouse/user, created before superAdminTenantService.create finishes
// opening a subscription) must never be blocked by a quota check that has
// nothing to compare against yet.
export async function getActivePlanLimits(tenantId: bigint): Promise<PlanLimits> {
  const subscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId, status: { in: ["ACTIVE", "TRIAL"] } },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });
  if (!subscription) {
    return { maxWarehouses: null, maxUsers: null };
  }
  return { maxWarehouses: subscription.plan.maxWarehouses, maxUsers: subscription.plan.maxUsers };
}
