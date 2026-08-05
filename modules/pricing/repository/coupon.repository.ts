import { prisma } from "@/shared/database/prisma";
import type { Db } from "@/shared/database/transaction-client";
import type { Prisma } from "@prisma/client";

export const couponRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.coupon.findMany({
      where: { tenantId },
      include: { products: true, categories: true },
      orderBy: { createdAt: "desc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.coupon.findFirst({
      where: { id, tenantId },
      include: { products: true, categories: true },
    });
  },

  // Used by the promotion engine to look up a customer-entered code.
  // Includes products/categories so a PRODUCT/CATEGORY-scoped coupon's line
  // matching (see promotion.service.ts) doesn't need a second query.
  findActiveByCode(tenantId: bigint, code: string, now: Date) {
    return prisma.coupon.findFirst({
      where: {
        tenantId,
        code,
        isActive: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      include: { products: true, categories: true },
    });
  },

  create(data: Prisma.CouponUncheckedCreateInput) {
    return prisma.coupon.create({ data });
  },

  linkProduct(couponId: bigint, productId: bigint) {
    return prisma.couponProduct.create({ data: { couponId, productId } });
  },

  linkCategory(couponId: bigint, categoryId: bigint) {
    return prisma.couponCategory.create({ data: { couponId, categoryId } });
  },

  findWarehouseForTenant(tenantId: bigint, warehouseId: bigint) {
    return prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId, deletedAt: null } });
  },

  findCustomerGroupForTenant(tenantId: bigint, customerGroupId: bigint) {
    return prisma.customerGroup.findFirst({ where: { id: customerGroupId, tenantId } });
  },

  findCustomerForTenant(tenantId: bigint, customerId: bigint) {
    return prisma.customer.findFirst({ where: { id: customerId, tenantId, deletedAt: null } });
  },

  findProductForTenant(tenantId: bigint, productId: bigint) {
    return prisma.product.findFirst({ where: { id: productId, tenantId, deletedAt: null } });
  },

  findCategoryForTenant(tenantId: bigint, categoryId: bigint) {
    return prisma.category.findFirst({ where: { id: categoryId, tenantId, deletedAt: null } });
  },

  // Row lock, held for the rest of the enclosing transaction — serializes
  // concurrent redemption attempts for the SAME coupon so the
  // count-then-insert usage-limit check below can't be raced (two
  // concurrent checkouts both reading "used 99 of 100" and both proceeding).
  // Same "absolutely necessary" raw-SQL exception as
  // modules/inventory/repository/inventory.repository.ts.
  async lockCoupon(tx: Db, couponId: bigint): Promise<void> {
    await tx.$queryRaw`SELECT id FROM coupons WHERE id = ${couponId} FOR UPDATE`;
  },

  countRedemptions(tx: Db, couponId: bigint) {
    return tx.couponRedemption.count({ where: { couponId } });
  },

  countRedemptionsByCustomer(tx: Db, couponId: bigint, customerId: bigint) {
    return tx.couponRedemption.count({ where: { couponId, customerId } });
  },

  createRedemption(tx: Db, data: Prisma.CouponRedemptionUncheckedCreateInput) {
    return tx.couponRedemption.create({ data });
  },
};
