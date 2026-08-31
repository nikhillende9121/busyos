import type { Plan, PlanFeature, Feature } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { superAdminPlanRepository } from "../repository/plan.repository";
import { superAdminFeatureRepository } from "../repository/feature.repository";
import { superAdminTenantRepository } from "../repository/tenant.repository";
import { superAdminTenantService } from "./tenant.service";
import { AppError } from "@/shared/errors/app-error";
import type { CreatePlanDto, UpdatePlanDto } from "../dto/plan.dto";
import type { PlanView } from "../types/plan.types";

type PlanWithFeatures = Plan & { planFeatures: (PlanFeature & { feature: Feature })[] };

async function resolveFeatureIds(codes: string[]): Promise<bigint[]> {
  if (codes.length === 0) return [];
  const features = await superAdminFeatureRepository.findByCodes(codes);
  if (features.length !== new Set(codes).size) {
    const found = new Set(features.map((f) => f.code));
    const missing = codes.filter((code) => !found.has(code));
    throw new AppError("VALIDATION_ERROR", `Unknown feature code(s): ${missing.join(", ")}`);
  }
  return features.map((f) => f.id);
}

export const superAdminPlanService = {
  async list(): Promise<PlanView[]> {
    const plans = await superAdminPlanRepository.findMany();
    return plans.map(toPlanView);
  },

  async create(dto: CreatePlanDto): Promise<PlanView> {
    const featureIds = await resolveFeatureIds(dto.featureCodes ?? []);

    const plan = await prisma.$transaction(async (tx) => {
      const created = await superAdminPlanRepository.create(tx, {
        name: dto.name,
        price: dto.price,
        billingCycle: dto.billingCycle,
        maxWarehouses: dto.maxWarehouses ?? null,
        maxUsers: dto.maxUsers ?? null,
        maxRoles: dto.maxRoles ?? null,
      });
      await superAdminPlanRepository.addFeatures(tx, created.id, featureIds);
      return created;
    });

    const withFeatures = await superAdminPlanRepository.findById(plan.id);
    return toPlanView(withFeatures!);
  },

  // Full replace of the plan's own fields and feature list, then resyncs
  // every tenant currently subscribed to it — this is what makes editing
  // a plan's features actually take effect, rather than only affecting
  // tenants created after the edit. See tenant.service.ts's
  // resyncFeatures() for exactly what "resync" means (enable what's
  // newly included, disable what's no longer included — never delete).
  async update(dto: UpdatePlanDto): Promise<PlanView> {
    const existing = await superAdminPlanRepository.findById(dto.planId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Plan not found");
    }
    const featureIds = await resolveFeatureIds(dto.featureCodes ?? []);

    await prisma.$transaction(async (tx) => {
      await superAdminPlanRepository.update(tx, dto.planId, {
        name: dto.name,
        price: dto.price,
        billingCycle: dto.billingCycle,
        maxWarehouses: dto.maxWarehouses ?? null,
        maxUsers: dto.maxUsers ?? null,
        maxRoles: dto.maxRoles ?? null,
      });
      await superAdminPlanRepository.replaceFeatures(tx, dto.planId, featureIds);
    });

    const tenantIds = await superAdminTenantRepository.findTenantIdsOnPlan(dto.planId);
    for (const tenantId of tenantIds) {
      await superAdminTenantService.resyncFeatures(tenantId);
    }

    const withFeatures = await superAdminPlanRepository.findById(dto.planId);
    return toPlanView(withFeatures!);
  },
};

function toPlanView(plan: PlanWithFeatures): PlanView {
  return {
    id: plan.id.toString(),
    name: plan.name,
    price: plan.price.toString(),
    billingCycle: plan.billingCycle,
    maxWarehouses: plan.maxWarehouses,
    maxUsers: plan.maxUsers,
    maxRoles: plan.maxRoles,
    features: plan.planFeatures.map((pf) => pf.feature.code),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
