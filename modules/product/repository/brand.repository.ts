import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

export const brandRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.brand.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.brand.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  create(data: Prisma.BrandUncheckedCreateInput) {
    return prisma.brand.create({ data });
  },

  update(id: bigint, data: Prisma.BrandUncheckedUpdateInput) {
    return prisma.brand.update({ where: { id }, data });
  },

  updateImage(id: bigint, imagePublicId: string | null) {
    return prisma.brand.update({ where: { id }, data: { imagePublicId } });
  },

  softDelete(id: bigint) {
    return prisma.brand.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  async hasProducts(brandId: bigint): Promise<boolean> {
    const count = await prisma.product.count({ where: { brandId, deletedAt: null } });
    return count > 0;
  },
};
