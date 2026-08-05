import { Prisma } from "@prisma/client";
import type { Feature } from "@prisma/client";
import { superAdminFeatureRepository } from "../repository/feature.repository";
import { AppError } from "@/shared/errors/app-error";
import type { CreateFeatureDto } from "../dto/feature.dto";
import type { FeatureView } from "../types/feature.types";

export const superAdminFeatureService = {
  async list(): Promise<FeatureView[]> {
    const features = await superAdminFeatureRepository.findMany();
    return features.map(toFeatureView);
  },

  async create(dto: CreateFeatureDto): Promise<FeatureView> {
    try {
      const feature = await superAdminFeatureRepository.create({ name: dto.name, code: dto.code });
      return toFeatureView(feature);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("DUPLICATE_CODE", "A feature with this code already exists");
      }
      throw error;
    }
  },
};

function toFeatureView(feature: Feature): FeatureView {
  return {
    id: feature.id.toString(),
    name: feature.name,
    code: feature.code,
    createdAt: feature.createdAt.toISOString(),
    updatedAt: feature.updatedAt.toISOString(),
  };
}
