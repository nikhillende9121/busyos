import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

type ProductFilter = {
  status?: string;
  categoryId?: bigint;
  search?: string;
  // Restricts to this exact set of ids — used to filter the catalog down
  // to "only what's priced for this warehouse" (see product.service.ts's
  // list()). Undefined means no restriction; an empty array (a warehouse
  // with nothing priced at all) deliberately yields zero rows, not
  // "unrestricted".
  productIds?: bigint[];
};

type ProductSort = {
  sortBy: "name" | "sku" | "createdAt";
  sortDir: "asc" | "desc";
};

function whereClause(tenantId: bigint, filter: ProductFilter): Prisma.ProductWhereInput {
  return {
    tenantId,
    deletedAt: null,
    ...(filter.status ? { status: filter.status as Prisma.ProductWhereInput["status"] } : {}),
    ...(filter.categoryId !== undefined ? { categoryId: filter.categoryId } : {}),
    ...(filter.productIds !== undefined ? { id: { in: filter.productIds } } : {}),
    ...(filter.search
      ? {
          OR: [
            { name: { contains: filter.search } },
            { sku: { contains: filter.search } },
          ],
        }
      : {}),
  };
}

// Prisma queries only, always scoped by tenantId — see MODULES.md ->
// repository/. Soft-deleted rows (deletedAt != null) are excluded by
// default in every read here; there is no "include deleted" path yet
// because nothing in this module needs to restore a deleted product.
export const productRepository = {
  findManyByTenant(
    tenantId: bigint,
    filter: ProductFilter & ProductSort & { skip: number; take: number },
  ) {
    return prisma.product.findMany({
      where: whereClause(tenantId, filter),
      orderBy: { [filter.sortBy]: filter.sortDir },
      skip: filter.skip,
      take: filter.take,
      include: { images: { orderBy: { sortOrder: "asc" } } },
    });
  },

  countByTenant(tenantId: bigint, filter: ProductFilter) {
    return prisma.product.count({ where: whereClause(tenantId, filter) });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { images: { orderBy: { sortOrder: "asc" } } },
    });
  },

  findManyByIds(tenantId: bigint, ids: bigint[]) {
    return prisma.product.findMany({
      where: { tenantId, id: { in: ids }, deletedAt: null },
      include: { images: { orderBy: { sortOrder: "asc" } } },
    });
  },

  create(data: Prisma.ProductUncheckedCreateInput) {
    return prisma.product.create({ data });
  },

  update(id: bigint, data: Prisma.ProductUncheckedUpdateInput) {
    return prisma.product.update({
      where: { id },
      data,
      include: { images: { orderBy: { sortOrder: "asc" } } },
    });
  },

  softDelete(id: bigint, deletedBy?: bigint) {
    return prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  },

  async categoryBelongsToTenant(tenantId: bigint, categoryId: bigint): Promise<boolean> {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, tenantId, deletedAt: null },
    });
    return category !== null;
  },

  async brandBelongsToTenant(tenantId: bigint, brandId: bigint): Promise<boolean> {
    const brand = await prisma.brand.findFirst({
      where: { id: brandId, tenantId, deletedAt: null },
    });
    return brand !== null;
  },

  // Units may be tenant-owned or shared system data (tenantId = null) — see
  // the Unit model in prisma/schema.prisma.
  async unitBelongsToTenant(tenantId: bigint, unitId: bigint): Promise<boolean> {
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, OR: [{ tenantId }, { tenantId: null }] },
    });
    return unit !== null;
  },

  async taxRateBelongsToTenant(tenantId: bigint, taxRateId: bigint): Promise<boolean> {
    const taxRate = await prisma.taxRate.findFirst({
      where: { id: taxRateId, tenantId, deletedAt: null },
    });
    return taxRate !== null;
  },
};
