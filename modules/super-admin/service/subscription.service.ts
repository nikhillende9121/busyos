import type { Plan, Tenant, TenantSubscription } from "@prisma/client";
import { superAdminSubscriptionRepository } from "../repository/subscription.repository";
import { superAdminTenantRepository } from "../repository/tenant.repository";
import { superAdminTenantService } from "./tenant.service";
import { AppError } from "@/shared/errors/app-error";
import { getActiveSubscription, isSubscriptionExpired } from "@/shared/utils/subscription";
import type { CreateContractDto, CancelContractDto } from "../dto/subscription.dto";
import type { ContractView, ContractWithTenantView } from "../types/subscription.types";

const DAY_MS = 24 * 60 * 60 * 1000;

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
