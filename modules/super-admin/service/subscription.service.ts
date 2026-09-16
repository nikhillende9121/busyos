import type { Plan, Tenant, TenantSubscription } from "@prisma/client";
import { superAdminSubscriptionRepository } from "../repository/subscription.repository";
import { superAdminTenantRepository } from "../repository/tenant.repository";
import { superAdminTenantService } from "./tenant.service";
import { AppError } from "@/shared/errors/app-error";
import { getActiveSubscription, isSubscriptionExpired } from "@/shared/utils/subscription";
import { notificationService } from "@/modules/notification/service/notification.service";
import { notificationRepository } from "@/modules/notification/repository/notification.repository";
import { userRepository } from "@/modules/user/repository/user.repository";
import type { CreateContractDto, CancelContractDto } from "../dto/subscription.dto";
import type { ContractView, ContractWithTenantView } from "../types/subscription.types";

const DAY_MS = 24 * 60 * 60 * 1000;

// Who gets an expiry alert — same "resolve by permission code" idiom
// already used for the delivery-assignee picker
// (userRepository.findManyByTenantWithPermission), not a hardcoded "ADMIN"
// role-code check. TENANT.UPDATE_SETTINGS is the permission the Settings
// page itself is gated by, so "can edit tenant settings" is this
// codebase's existing definition of "is an admin of this tenant."
const TENANT_ADMIN_PERMISSION = "TENANT.UPDATE_SETTINGS";

// Checked in this order (most-distant first) so that if a run is ever
// skipped/delayed and a subscription jumps straight past an earlier
// threshold, whichever alerts are newly due all still fire in one pass —
// each threshold is independently deduplicated by
// notificationRepository.existsForSubscriptionThreshold, so catching up
// like that is safe, not a double-send.
const EXPIRY_ALERT_THRESHOLDS: {
  type: string;
  maxDaysRemaining: number;
  title: string;
  buildMessage: (planName: string, endDate: Date, daysRemaining: number) => string;
}[] = [
  {
    type: "SUBSCRIPTION_EXPIRING_30D",
    maxDaysRemaining: 30,
    title: "Your plan expires in 30 days",
    buildMessage: (planName, endDate) =>
      `Your "${planName}" plan expires on ${endDate.toLocaleDateString()}. Renew soon to avoid any interruption.`,
  },
  {
    type: "SUBSCRIPTION_EXPIRING_7D",
    maxDaysRemaining: 7,
    title: "Your plan expires in 7 days",
    buildMessage: (planName, endDate, daysRemaining) =>
      `Your "${planName}" plan expires on ${endDate.toLocaleDateString()} — only ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left. Please renew soon.`,
  },
  {
    type: "SUBSCRIPTION_EXPIRING_1D",
    maxDaysRemaining: 1,
    title: "Your plan expires tomorrow",
    buildMessage: (planName, endDate) =>
      `Your "${planName}" plan expires on ${endDate.toLocaleDateString()} — that's tomorrow. Renew today to avoid losing access.`,
  },
  {
    type: "SUBSCRIPTION_EXPIRED",
    maxDaysRemaining: 0,
    title: "Your plan has expired",
    buildMessage: (planName, endDate) =>
      `Your "${planName}" plan expired on ${endDate.toLocaleDateString()}. Users can no longer sign in until it's renewed — please contact us to renew.`,
  },
];

export const superAdminSubscriptionService = {
  async listForTenant(tenantId: bigint): Promise<ContractView[]> {
    const rows = await superAdminSubscriptionRepository.findManyByTenant(tenantId);
    return rows.map(toContractView);
  },

  // Platform-wide overview, every tenant — currently-active contracts
  // first (soonest-expiring on top within that group), everything else
  // (expired/cancelled) after. The DB query already sorts by endDate
  // ascending; isCurrentlyActive can only be computed in code (it depends
  // on "now"), so the active/inactive grouping happens here.
  async listAll(): Promise<ContractWithTenantView[]> {
    const rows = await superAdminSubscriptionRepository.findManyAcrossTenants();
    return rows.map(toContractWithTenantView).sort((a, b) => Number(b.isCurrentlyActive) - Number(a.isCurrentlyActive));
  },

  // Blocked while the tenant has a current, unexpired contract — a Super
  // Admin must explicitly cancel() first. This is what makes "only one
  // active contract" a real rule rather than the old changePlan()'s silent
  // auto-cancel-and-replace. A contract that's ACTIVE in status but has
  // already passed its endDate (nothing auto-flips status in this system,
  // see shared/utils/subscription.ts) does NOT block a new one — it's
  // functionally over, just not yet marked so.
  async create(dto: CreateContractDto): Promise<ContractView> {
    const plan = await superAdminTenantRepository.findPlanById(dto.planId);
    if (!plan) {
      throw new AppError("VALIDATION_ERROR", "planId does not exist");
    }

    const current = await getActiveSubscription(dto.tenantId);
    if (current && !isSubscriptionExpired(current)) {
      throw new AppError("CONFLICT", "Tenant already has an active contract");
    }

    const created = await superAdminSubscriptionRepository.create({
      tenantId: dto.tenantId,
      planId: dto.planId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      status: "ACTIVE",
      priceAtSigning: plan.price,
    });

    await superAdminTenantService.resyncFeatures(dto.tenantId);
    return toContractView(created);
  },

  // Meant to be invoked periodically by an external scheduler (no
  // in-process cron in this codebase — same pattern as
  // webhookService.processPendingDeliveries) to scan every ACTIVE/TRIAL
  // subscription across every tenant and notify that tenant's admins once
  // it crosses the 30/7/1-day-remaining or already-expired thresholds.
  // Idempotent per (subscription, threshold) — see
  // notificationRepository.existsForSubscriptionThreshold — so calling
  // this more often than once a day, or after a missed run, never
  // double-sends.
  async processExpiryAlerts(now: Date = new Date()): Promise<{ notificationsSent: number }> {
    const subscriptions = await superAdminSubscriptionRepository.findManyAcrossTenants();
    let notificationsSent = 0;

    for (const subscription of subscriptions) {
      if (subscription.status !== "ACTIVE" && subscription.status !== "TRIAL") continue;

      const daysRemaining = Math.ceil((subscription.endDate.getTime() - now.getTime()) / DAY_MS);

      for (const threshold of EXPIRY_ALERT_THRESHOLDS) {
        if (daysRemaining > threshold.maxDaysRemaining) continue;

        const alreadySent = await notificationRepository.existsForSubscriptionThreshold(
          subscription.tenantId,
          subscription.id,
          threshold.type,
        );
        if (alreadySent) continue;

        const admins = await userRepository.findManyByTenantWithPermission(
          subscription.tenantId,
          TENANT_ADMIN_PERMISSION,
        );
        // No permission-holding user to tell — still counts as "handled"
        // for this threshold (dedup keys off the notification actually
        // existing, so skipping here with nothing sent means this would
        // retry every run until a qualifying user exists; acceptable,
        // since a tenant with literally no one who can manage settings is
        // itself a data problem worth surfacing via a future run once
        // fixed, not something to silently mark done).
        if (admins.length === 0) continue;

        await notificationService.sendToUsers({
          tenantId: subscription.tenantId,
          userIds: admins.map((admin) => admin.id),
          title: threshold.title,
          message: threshold.buildMessage(subscription.plan.name, subscription.endDate, Math.max(daysRemaining, 0)),
          type: threshold.type,
          data: {
            subscriptionId: subscription.id.toString(),
            planName: subscription.plan.name,
            endDate: subscription.endDate.toISOString(),
          },
        });
        notificationsSent++;
      }
    }

    return { notificationsSent };
  },

  async cancel(dto: CancelContractDto): Promise<ContractView> {
    const existing = await superAdminSubscriptionRepository.findByIdForTenant(dto.tenantId, dto.subscriptionId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Contract not found");
    }
    if (existing.status !== "ACTIVE" && existing.status !== "TRIAL") {
      throw new AppError("CONFLICT", "Only an active contract can be cancelled");
    }

    const cancelled = await superAdminSubscriptionRepository.cancelById(dto.subscriptionId);
    await superAdminTenantService.resyncFeatures(dto.tenantId);
    return toContractView(cancelled);
  },
};

function computeIsExpiredByDate(subscription: TenantSubscription): boolean {
  return (
    (subscription.status === "ACTIVE" || subscription.status === "TRIAL") &&
    subscription.endDate.getTime() < Date.now()
  );
}

function toContractView(subscription: TenantSubscription & { plan: Plan }): ContractView {
  return {
    id: subscription.id.toString(),
    planId: subscription.planId.toString(),
    planName: subscription.plan.name,
    startDate: subscription.startDate.toISOString(),
    endDate: subscription.endDate.toISOString(),
    status: subscription.status,
    isExpiredByDate: computeIsExpiredByDate(subscription),
    priceAtSigning: subscription.priceAtSigning.toString(),
    createdAt: subscription.createdAt.toISOString(),
  };
}

function toContractWithTenantView(
  subscription: TenantSubscription & { plan: Plan; tenant: Pick<Tenant, "id" | "name" | "code"> },
): ContractWithTenantView {
  const isExpiredByDate = computeIsExpiredByDate(subscription);
  return {
    ...toContractView(subscription),
    tenantId: subscription.tenant.id.toString(),
    tenantName: subscription.tenant.name,
    tenantCode: subscription.tenant.code,
    isCurrentlyActive:
      (subscription.status === "ACTIVE" || subscription.status === "TRIAL") && !isExpiredByDate,
    daysRemaining: Math.ceil((subscription.endDate.getTime() - Date.now()) / DAY_MS),
  };
}
