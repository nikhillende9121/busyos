import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma, PurchaseStatus } from "@prisma/client";

const includeFullPurchase = {
  items: { include: { taxes: true } },
  charges: true,
} as const;

export const purchaseRepository = {
  findManyByTenant(tenantId: bigint, filter: { status?: PurchaseStatus; warehouseId?: bigint | null }) {
    return prisma.purchase.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      },
      include: includeFullPurchase,
      orderBy: { purchaseDate: "desc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.purchase.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: includeFullPurchase,
    });
  },

  // Same shape as findByIdForTenant, but runs against the transaction
  // client — used at the end of create() to read back the fully-populated
  // purchase (items+taxes, charges) as one consistent snapshot instead of
  // hand-assembling it from partial writes.
  findByIdTx(tx: Db, id: bigint) {
    return tx.purchase.findFirstOrThrow({ where: { id }, include: includeFullPurchase });
  },

  create(tx: Db, data: Prisma.PurchaseUncheckedCreateInput) {
    return tx.purchase.create({ data });
  },

  createItem(tx: Db, data: Prisma.PurchaseItemUncheckedCreateInput) {
    return tx.purchaseItem.create({ data });
  },

  createItemTaxes(tx: Db, data: Prisma.PurchaseItemTaxCreateManyInput[]) {
    return tx.purchaseItemTax.createMany({ data });
  },

  createCharge(tx: Db, data: Prisma.PurchaseChargeUncheckedCreateInput) {
    return tx.purchaseCharge.create({ data });
  },

  updateStatus(tx: Db, id: bigint, status: PurchaseStatus) {
    return tx.purchase.update({ where: { id }, data: { status } });
  },

  updateItemReceivedQuantity(tx: Db, id: bigint, receivedQuantity: Prisma.Decimal) {
    return tx.purchaseItem.update({ where: { id }, data: { receivedQuantity } });
  },

  findItemsForPurchase(tx: Db, purchaseId: bigint) {
    return tx.purchaseItem.findMany({ where: { purchaseId }, include: { taxes: true } });
  },

  findSupplierForTenant(tenantId: bigint, supplierId: bigint) {
    return prisma.supplier.findFirst({ where: { id: supplierId, tenantId, deletedAt: null } });
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
