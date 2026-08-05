import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

// Prisma queries only, tenant-scoped — see MODULES.md -> repository/. No
// pagination: a tenant's tax-rate catalog is realistically a handful of
// GST slabs, not thousands of rows — same reasoning as warehouse.repository.ts.
export const taxRateRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.taxRate.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.taxRate.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  create(data: Prisma.TaxRateUncheckedCreateInput) {
    return prisma.taxRate.create({ data });
  },

  update(id: bigint, data: Prisma.TaxRateUncheckedUpdateInput) {
    return prisma.taxRate.update({ where: { id }, data });
  },

  softDelete(id: bigint, deletedBy?: bigint) {
    return prisma.taxRate.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  },

  // Blocked, not cascaded — see DATABASE.md -> Foreign Key Rules. A rate
  // still assigned to a product must be reassigned first, not silently
  // orphan those products' tax calculation.
  async hasProductsUsingRate(taxRateId: bigint): Promise<boolean> {
    const count = await prisma.product.count({ where: { taxRateId, deletedAt: null } });
    return count > 0;
  },
};
