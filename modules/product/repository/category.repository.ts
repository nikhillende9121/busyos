import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

// Prisma queries only, tenant-scoped — see MODULES.md -> repository/.
// No pagination here (unlike product.repository.ts): a tenant's category
// tree is realistically small, so a flat list is proportionate; add
// pagination if that assumption stops holding, not preemptively.
export const categoryRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.category.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.category.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  create(data: Prisma.CategoryUncheckedCreateInput) {
    return prisma.category.create({ data });
  },

  update(id: bigint, data: Prisma.CategoryUncheckedUpdateInput) {
    return prisma.category.update({ where: { id }, data });
  },

  updateImage(id: bigint, imagePublicId: string | null) {
    return prisma.category.update({ where: { id }, data: { imagePublicId } });
  },

  softDelete(id: bigint) {
    return prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  async hasProducts(categoryId: bigint): Promise<boolean> {
    const count = await prisma.product.count({ where: { categoryId, deletedAt: null } });
    return count > 0;
  },

  async hasChildren(categoryId: bigint): Promise<boolean> {
    const count = await prisma.category.count({ where: { parentId: categoryId, deletedAt: null } });
    return count > 0;
  },
};
