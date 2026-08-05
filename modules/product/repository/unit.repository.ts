import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

// Units are either tenant-owned or shared system data (tenantId = null,
// Super Admin-managed) — see prisma/schema.prisma Unit model. Two distinct
// read methods reflect two distinct rules: everything visible to a tenant
// is readable, but only that tenant's own rows are writable.
export const unitRepository = {
  findManyVisibleToTenant(tenantId: bigint) {
    return prisma.unit.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { name: "asc" },
    });
  },

  findVisibleToTenant(tenantId: bigint, id: bigint) {
    return prisma.unit.findFirst({ where: { id, OR: [{ tenantId }, { tenantId: null }] } });
  },

  findOwnedByTenant(tenantId: bigint, id: bigint) {
    return prisma.unit.findFirst({ where: { id, tenantId } });
  },

  create(data: Prisma.UnitUncheckedCreateInput) {
    return prisma.unit.create({ data });
  },

  update(id: bigint, data: Prisma.UnitUncheckedUpdateInput) {
    return prisma.unit.update({ where: { id }, data });
  },

  // Unit has no deletedAt (see prisma/schema.prisma) — a lookup table this
  // small doesn't warrant soft-delete/recovery, unlike Product/Category/Brand.
  hardDelete(id: bigint) {
    return prisma.unit.delete({ where: { id } });
  },

  async hasProducts(unitId: bigint): Promise<boolean> {
    const count = await prisma.product.count({ where: { unitId, deletedAt: null } });
    return count > 0;
  },
};
