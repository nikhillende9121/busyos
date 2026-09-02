import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma, SaleChannel, SaleStatus } from "@prisma/client";

const includeFullSale = {
  customer: true,
  tenant: { include: { settings: true } },
  items: { include: { taxes: true, product: true } },
  discounts: true,
  charges: true,
  assignedDeliveryUser: { select: { id: true, name: true } },
} as const;

type SaleFilter = {
  status?: SaleStatus;
  channel?: SaleChannel;
  warehouseId?: bigint | null;
  dateFrom?: Date;
  dateTo?: Date;
  // Narrows to sales assigned to this one user — set only for a caller
  // scoped to their own deliveries, see saleService.resolveDeliveryScope.
  assignedDeliveryUserId?: bigint | null;
};

function whereClause(tenantId: bigint, filter: SaleFilter): Prisma.SaleWhereInput {
  return {
    tenantId,
    deletedAt: null,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.channel ? { channel: filter.channel } : {}),
    ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
    ...(filter.assignedDeliveryUserId ? { assignedDeliveryUserId: filter.assignedDeliveryUserId } : {}),
    ...(filter.dateFrom || filter.dateTo
      ? {
          saleDate: {
            ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
            ...(filter.dateTo ? { lte: filter.dateTo } : {}),
          },
        }
      : {}),
  };
}

export const saleRepository = {
  // skip/take both optional — omitted entirely (not 0/undefined passed to
  // Prisma) means "every matching row," which is what exportList() wants;
  // list() always supplies both, computed from page/pageSize.
  findManyByTenant(tenantId: bigint, filter: SaleFilter & { skip?: number; take?: number }) {
    return prisma.sale.findMany({
      where: whereClause(tenantId, filter),
      include: includeFullSale,
      orderBy: { saleDate: "desc" },
      ...(filter.skip !== undefined ? { skip: filter.skip } : {}),
      ...(filter.take !== undefined ? { take: filter.take } : {}),
    });
  },

  countByTenant(tenantId: bigint, filter: SaleFilter) {
    return prisma.sale.count({ where: whereClause(tenantId, filter) });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.sale.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: includeFullSale,
    });
  },

  // Second-layer dedup for inbound order ingestion, alongside
  // IdempotencyKey — a caller that didn't send an Idempotency-Key header
  // but resubmits the same external order gets the existing sale back
  // instead of a duplicate. See Docs/webhooks.md §4.1.
  findByWebhookOrigin(tenantId: bigint, webhookIntegrationId: bigint, externalOrderReference: string) {
    return prisma.sale.findFirst({
      where: { tenantId, webhookIntegrationId, externalOrderReference, deletedAt: null },
      include: includeFullSale,
    });
  },

  // Same shape as findByIdForTenant, but runs against the transaction
  // client — used at the end of create() to read back the fully-populated
  // sale (items+taxes, discounts, charges) as one consistent snapshot
  // instead of hand-assembling it from partial writes.
  findByIdTx(tx: Db, id: bigint) {
    return tx.sale.findFirstOrThrow({ where: { id }, include: includeFullSale });
  },

  create(tx: Db, data: Prisma.SaleUncheckedCreateInput) {
    return tx.sale.create({ data });
  },

  createItem(tx: Db, data: Prisma.SaleItemUncheckedCreateInput) {
    return tx.saleItem.create({ data });
  },

  createItemTaxes(tx: Db, data: Prisma.SaleItemTaxCreateManyInput[]) {
    return tx.saleItemTax.createMany({ data });
  },

  createCharge(tx: Db, data: Prisma.SaleChargeUncheckedCreateInput) {
    return tx.saleCharge.create({ data });
  },

  findDiscountsForSale(tx: Db, saleId: bigint) {
    return tx.saleDiscount.findMany({ where: { saleId } });
  },

  updateStatus(tx: Db, id: bigint, status: SaleStatus, extra: Prisma.SaleUncheckedUpdateInput = {}) {
    return tx.sale.update({ where: { id }, data: { status, ...extra } });
  },

  findCustomerForTenant(tenantId: bigint, customerId: bigint) {
    return prisma.customer.findFirst({ where: { id: customerId, tenantId, deletedAt: null } });
  },

  findWarehouseForTenant(tenantId: bigint, warehouseId: bigint) {
    return prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId, deletedAt: null } });
  },

  findProductForTenant(tenantId: bigint, productId: bigint) {
    return prisma.product.findFirst({ where: { id: productId, tenantId, deletedAt: null } });
  },

  findExtraChargeForTenant(tenantId: bigint, extraChargeId: bigint) {
    return prisma.extraCharge.findFirst({ where: { id: extraChargeId, tenantId, deletedAt: null, isActive: true } });
  },
};
