import { prisma } from "@/shared/database/prisma";
import type { Prisma } from "@prisma/client";

// "applies regardless" (field is null) OR "matches this specific context
// value". When no context value is available at all, only the
// applies-regardless case can match — never silently matches everything.
function contextMatch(
  field: "warehouseId" | "customerGroupId" | "customerId",
  value: bigint | undefined,
): Prisma.DiscountWhereInput {
  if (value === undefined) {
    return { [field]: null };
  }
  return { OR: [{ [field]: null }, { [field]: value }] };
}

export const discountRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.discount.findMany({
      where: { tenantId },
      include: { products: true, categories: true },
      orderBy: { createdAt: "desc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.discount.findFirst({
      where: { id, tenantId },
      include: { products: true, categories: true },
    });
  },

  create(data: Prisma.DiscountUncheckedCreateInput) {
    return prisma.discount.create({ data });
  },

  linkProduct(discountId: bigint, productId: bigint) {
    return prisma.discountProduct.create({ data: { discountId, productId } });
  },

  linkCategory(discountId: bigint, categoryId: bigint) {
    return prisma.discountCategory.create({ data: { discountId, categoryId } });
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

  // Used by the promotion engine (see service/promotion.service.ts) to find
  // every active Discount applicable to one line item's context.
  findApplicableForProduct(
    tenantId: bigint,
    params: {
      warehouseId?: bigint;
      customerGroupId?: bigint;
      customerId?: bigint;
      productId: bigint;
      categoryId?: bigint;
      now: Date;
    },
  ) {
    const scopeOr: Prisma.DiscountWhereInput[] = [
      { scope: "ORDER" },
      { scope: "PRODUCT", products: { some: { productId: params.productId } } },
    ];
    if (params.categoryId !== undefined) {
      scopeOr.push({ scope: "CATEGORY", categories: { some: { categoryId: params.categoryId } } });
    }

    return prisma.discount.findMany({
      where: {
        tenantId,
        isActive: true,
        startDate: { lte: params.now },
        AND: [
          { OR: [{ endDate: null }, { endDate: { gte: params.now } }] },
          contextMatch("warehouseId", params.warehouseId),
          contextMatch("customerGroupId", params.customerGroupId),
          contextMatch("customerId", params.customerId),
          { OR: scopeOr },
        ],
      },
    });
  },
};
