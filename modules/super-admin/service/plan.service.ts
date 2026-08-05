import type { Plan, PlanFeature, Feature } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { superAdminPlanRepository } from "../repository/plan.repository";
import { superAdminFeatureRepository } from "../repository/feature.repository";
import { AppError } from "@/shared/errors/app-error";
import type { CreatePlanDto } from "../dto/plan.dto";
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
      });
      await superAdminPlanRepository.addFeatures(tx, created.id, featureIds);
      return created;
    });

    const withFeatures = await superAdminPlanRepository.findById(plan.id);
    return toPlanView(withFeatures!);
  },
};

function toPlanView(plan: PlanWithFeatures): PlanView {
  return {
    id: plan.id.toString(),
    name: plan.name,
    price: plan.price.toString(),
    billingCycle: plan.billingCycle,
    features: plan.planFeatures.map((pf) => pf.feature.code),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
