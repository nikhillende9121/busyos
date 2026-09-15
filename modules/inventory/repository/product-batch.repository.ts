import { Prisma } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";

type BatchFilter = {
  warehouseId?: bigint;
  productId?: bigint;
  expiringBefore?: Date;
};

function whereClause(tenantId: bigint, filter: BatchFilter): Prisma.ProductBatchWhereInput {
  return {
    tenantId,
    quantity: { gt: 0 },
    ...(filter.warehouseId !== undefined ? { warehouseId: filter.warehouseId } : {}),
    ...(filter.productId !== undefined ? { productId: filter.productId } : {}),
    ...(filter.expiringBefore ? { expiryDate: { not: null, lte: filter.expiringBefore } } : {}),
  };
}

export const productBatchRepository = {
  // Soonest-expiring first, batches with no expiry sorted last — same
  // read-side ordering as the FEFO pick itself (lockBatchesForFefo in
  // inventory.repository.ts), so the report reads in the order stock
  // would actually be sold.
  listByTenant(tenantId: bigint, filter: BatchFilter & { skip: number; take: number }) {
    return prisma.productBatch.findMany({
      where: whereClause(tenantId, filter),
      orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }],
      skip: filter.skip,
      take: filter.take,
    });
  },

  countByTenant(tenantId: bigint, filter: BatchFilter) {
    return prisma.productBatch.count({ where: whereClause(tenantId, filter) });
  },

  findByIdForTenant(tenantId: bigint, batchId: bigint) {
    return prisma.productBatch.findFirst({ where: { id: batchId, tenantId } });
  },
};
