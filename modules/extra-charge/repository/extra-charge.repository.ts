import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

// Prisma queries only, tenant-scoped — see MODULES.md -> repository/. No
// pagination: a tenant's extra-charges catalog (shipping/packing/handling)
// is realistically a handful of entries, not thousands of rows.
export const extraChargeRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.extraCharge.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.extraCharge.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  // Cross-entity ownership check (this charge's taxRateId actually belongs
  // to the same tenant) — a direct query, not a call into modules/tax-rate's
  // service, matching modules/sales/repository/sale.repository.ts's own
  // findWarehouseForTenant/findCustomerForTenant style.
  findTaxRateForTenant(tenantId: bigint, id: bigint) {
    return prisma.taxRate.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  create(data: Prisma.ExtraChargeUncheckedCreateInput) {
    return prisma.extraCharge.create({ data });
  },

  update(id: bigint, data: Prisma.ExtraChargeUncheckedUpdateInput) {
    return prisma.extraCharge.update({ where: { id }, data });
  },

  softDelete(id: bigint, deletedBy?: bigint) {
    return prisma.extraCharge.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  },
};
