import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma } from "@prisma/client";

const includeFull = {
  saleReturn: { include: { items: { include: { saleItem: true } } } },
  newSale: { include: { items: { include: { taxes: true } }, discounts: true, charges: true } },
} as const;

// Shared shape for every method below — lets sale-exchange.service.ts type
// its view-conversion helper without repeating this include tree.
export type SaleExchangeWithDetails = Prisma.SaleExchangeGetPayload<{ include: typeof includeFull }>;

export const saleExchangeRepository = {
  findManyByTenant(tenantId: bigint, warehouseId?: bigint | null) {
    return prisma.saleExchange.findMany({
      where: {
        newSale: { tenantId, ...(warehouseId ? { warehouseId } : {}) },
      },
      include: includeFull,
      orderBy: { createdAt: "desc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.saleExchange.findFirst({
      where: { id, newSale: { tenantId } },
      include: includeFull,
    });
  },

  create(tx: Db, data: Prisma.SaleExchangeUncheckedCreateInput) {
    return tx.saleExchange.create({ data, include: includeFull });
  },
};
