import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma } from "@prisma/client";

const includeFeatures = { planFeatures: { include: { feature: true } } } as const;

export const superAdminPlanRepository = {
  findMany() {
    return prisma.plan.findMany({ include: includeFeatures, orderBy: { name: "asc" } });
  },

  findById(id: bigint) {
    return prisma.plan.findUnique({ where: { id }, include: includeFeatures });
  },

  create(db: Db, data: Prisma.PlanCreateInput) {
    return db.plan.create({ data });
  },

  update(db: Db, id: bigint, data: Prisma.PlanUpdateInput) {
    return db.plan.update({ where: { id }, data });
  },

  async addFeatures(db: Db, planId: bigint, featureIds: bigint[]): Promise<void> {
    if (featureIds.length === 0) return;
    await db.planFeature.createMany({ data: featureIds.map((featureId) => ({ planId, featureId })) });
  },

  // Full replace, not a diff — a plan's feature list is small (well under
  // 20 rows), so delete-then-recreate is simpler and just as correct as
  // computing an add/remove set.
  async replaceFeatures(db: Db, planId: bigint, featureIds: bigint[]): Promise<void> {
    await db.planFeature.deleteMany({ where: { planId } });
    if (featureIds.length > 0) {
      await db.planFeature.createMany({ data: featureIds.map((featureId) => ({ planId, featureId })) });
    }
  },
};
