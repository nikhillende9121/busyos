import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

// CustomerGroup has no deletedAt (see prisma/schema.prisma) — a lookup table
// this small doesn't warrant soft-delete/recovery, same reasoning as Unit.
export const customerGroupRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.customerGroup.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.customerGroup.findFirst({ where: { id, tenantId } });
  },

  create(data: Prisma.CustomerGroupUncheckedCreateInput) {
    return prisma.customerGroup.create({ data });
  },

  update(id: bigint, data: Prisma.CustomerGroupUncheckedUpdateInput) {
    return prisma.customerGroup.update({ where: { id }, data });
  },

  hardDelete(id: bigint) {
    return prisma.customerGroup.delete({ where: { id } });
  },

  async hasCustomers(customerGroupId: bigint): Promise<boolean> {
    const count = await prisma.customer.count({ where: { customerGroupId } });
    return count > 0;
  },

  // PriceList/Discount/Coupon all cascade-delete on CustomerGroup removal
  // (see prisma/schema.prisma) — blocked here rather than relied on, so
  // deleting a group can never silently wipe pricing/promotion data.
  async hasPriceLists(customerGroupId: bigint): Promise<boolean> {
    const count = await prisma.priceList.count({ where: { customerGroupId } });
    return count > 0;
  },

  async hasDiscounts(customerGroupId: bigint): Promise<boolean> {
    const count = await prisma.discount.count({ where: { customerGroupId } });
    return count > 0;
  },

  async hasCoupons(customerGroupId: bigint): Promise<boolean> {
    const count = await prisma.coupon.count({ where: { customerGroupId } });
    return count > 0;
  },
};
