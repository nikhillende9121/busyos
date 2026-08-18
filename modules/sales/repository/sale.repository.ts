import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma, SaleChannel, SaleStatus } from "@prisma/client";

const includeFullSale = {
  customer: true,
  tenant: { include: { settings: true } },
  items: { include: { taxes: true, product: true } },
  discounts: true,
  charges: true,
} as const;

export const saleRepository = {
  findManyByTenant(
    tenantId: bigint,
    filter: { status?: SaleStatus; channel?: SaleChannel; warehouseId?: bigint | null },
  ) {
    return prisma.sale.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.channel ? { channel: filter.channel } : {}),
        ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      },
      include: includeFullSale,
      orderBy: { saleDate: "desc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.sale.findFirst({
      where: { id, tenantId, deletedAt: null },
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

  updateStatus(tx: Db, id: bigint, status: SaleStatus) {
    return tx.sale.update({ where: { id }, data: { status } });
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
