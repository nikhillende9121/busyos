import { prisma } from "@/shared/database/prisma";

// Prisma queries only — see MODULES.md -> repository/. Reads span several
// entities (Warehouse/Customer/TenantSetting/Product/TaxRate) because tax
// resolution genuinely needs all of them; nothing here writes.
export const taxRepository = {
  findWarehouseState(tenantId: bigint, warehouseId: bigint) {
    return prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
      select: { state: true },
    });
  },

  findCustomerState(tenantId: bigint, customerId: bigint) {
    return prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { state: true },
    });
  },

  findSupplierState(tenantId: bigint, supplierId: bigint) {
    return prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { state: true },
    });
  },

  findTenantSettings(tenantId: bigint) {
    return prisma.tenantSetting.findUnique({
      where: { tenantId },
      select: { homeState: true, taxInclusivePricing: true, defaultTaxRateId: true },
    });
  },

  findProductsTaxRateIds(tenantId: bigint, productIds: bigint[]) {
    return prisma.product.findMany({
      where: { tenantId, id: { in: productIds } },
      select: { id: true, taxRateId: true },
    });
  },

  findTaxRatesByIds(tenantId: bigint, taxRateIds: bigint[]) {
    return prisma.taxRate.findMany({
      where: { tenantId, id: { in: taxRateIds } },
      select: { id: true, ratePercent: true, cessPercent: true },
    });
  },
};
