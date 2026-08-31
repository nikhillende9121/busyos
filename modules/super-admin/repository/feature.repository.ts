import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

// No tenantId anywhere here — Feature is a platform-wide catalog (see
// prisma/schema.prisma's "System Tables" section).
export const superAdminFeatureRepository = {
  findMany() {
    return prisma.feature.findMany({ orderBy: { code: "asc" } });
  },

  findByCodes(codes: string[]) {
    return prisma.feature.findMany({ where: { code: { in: codes } } });
  },

  create(data: Prisma.FeatureCreateInput) {
    return prisma.feature.create({ data });
  },

  // How many tenants currently have each feature enabled — the dashboard's
  // adoption chart. Grouped, not one count-per-feature query, since the
  // feature catalog is small enough for one round trip.
  countEnabledByFeature() {
    return prisma.tenantFeature.groupBy({
      by: ["featureId"],
      where: { enabled: true },
      _count: { featureId: true },
    });
  },
};
