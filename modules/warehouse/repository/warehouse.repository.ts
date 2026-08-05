import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

// Prisma queries only, tenant-scoped — see MODULES.md -> repository/. No
// pagination (unlike product.repository.ts): a tenant's warehouse count is
// realistically a handful of physical locations, not thousands of rows.
export const warehouseRepository = {
  findManyByTenant(tenantId: bigint, scopedWarehouseId?: bigint | null) {
    return prisma.warehouse.findMany({
      where: { tenantId, deletedAt: null, ...(scopedWarehouseId ? { id: scopedWarehouseId } : {}) },
      orderBy: { name: "asc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.warehouse.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  // Backs the plan-limit check in warehouse.service.ts's create() — a
  // soft-deleted warehouse no longer counts against the quota.
  countActiveByTenant(tenantId: bigint) {
    return prisma.warehouse.count({ where: { tenantId, deletedAt: null } });
  },

  create(data: Prisma.WarehouseUncheckedCreateInput) {
    return prisma.warehouse.create({ data });
  },

  update(id: bigint, data: Prisma.WarehouseUncheckedUpdateInput) {
    return prisma.warehouse.update({ where: { id }, data });
  },

  softDelete(id: bigint, deletedBy?: bigint) {
    return prisma.warehouse.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  },

  async hasTerminals(warehouseId: bigint): Promise<boolean> {
    const count = await prisma.terminal.count({ where: { warehouseId, deletedAt: null } });
    return count > 0;
  },

  // "Has stock" is checked directly here rather than through an inventory
  // module service (which doesn't exist yet) — this is a narrow existence
  // check, not inventory business logic. Purchase/Sale/StockAdjustment/
  // StockTransfer history is NOT checked yet: those modules don't exist
  // either, and "does this warehouse have active history" depends on
  // business rules (e.g. cancelled vs completed) not yet designed. Revisit
  // this guard when those modules are built — see Docs/MODULE_GUIDE.md.
  async hasStock(warehouseId: bigint): Promise<boolean> {
    const balance = await prisma.inventoryBalance.findFirst({
      where: { warehouseId, quantity: { gt: 0 } },
    });
    return balance !== null;
  },
};
