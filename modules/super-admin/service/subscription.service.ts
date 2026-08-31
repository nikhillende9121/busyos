import type { Plan, TenantSubscription } from "@prisma/client";
import { superAdminSubscriptionRepository } from "../repository/subscription.repository";
import { superAdminTenantRepository } from "../repository/tenant.repository";
import { superAdminTenantService } from "./tenant.service";
import { AppError } from "@/shared/errors/app-error";
import { getActiveSubscription, isSubscriptionExpired } from "@/shared/utils/subscription";
import type { CreateContractDto, CancelContractDto } from "../dto/subscription.dto";
import type { ContractView } from "../types/subscription.types";

export const superAdminSubscriptionService = {
  async listForTenant(tenantId: bigint): Promise<ContractView[]> {
    const rows = await superAdminSubscriptionRepository.findManyByTenant(tenantId);
    return rows.map(toContractView);
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

function toContractView(subscription: TenantSubscription & { plan: Plan }): ContractView {
  const isExpiredByDate =
    (subscription.status === "ACTIVE" || subscription.status === "TRIAL") &&
    subscription.endDate.getTime() < Date.now();
  return {
    id: subscription.id.toString(),
    planId: subscription.planId.toString(),
    planName: subscription.plan.name,
    startDate: subscription.startDate.toISOString(),
    endDate: subscription.endDate.toISOString(),
    status: subscription.status,
    isExpiredByDate,
    priceAtSigning: subscription.priceAtSigning.toString(),
    createdAt: subscription.createdAt.toISOString(),
  };
}
