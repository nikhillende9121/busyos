import { prisma } from "@/shared/database/prisma";
import type { Prisma, PriceListItem } from "@prisma/client";

type ResolveParams = {
  tenantId: bigint;
  productId: bigint;
  warehouseId?: bigint;
  customerGroupId?: bigint;
  customerId?: bigint;
  quantity: Prisma.Decimal;
};

function findBestItem(priceListId: bigint, productId: bigint, quantity: Prisma.Decimal) {
  return prisma.priceListItem.findFirst({
    where: { priceListId, productId, minQuantity: { lte: quantity } },
    orderBy: { minQuantity: "desc" },
  });
}

// The single applicable PriceList for a warehouse with no customer/
// customerGroup context — shared by findBuyOnePriceItems and
// findPricedProductIds below, both of which need "which one list applies
// here" before touching items. A tenant-wide default PriceList is never
// considered here — only a price actually configured for this specific
// warehouse counts (see Docs/business-rules/pricing.md -> Price Resolution
// Order).
function findListForWarehouse(tenantId: bigint, warehouseId: bigint) {
  return prisma.priceList.findFirst({ where: { tenantId, warehouseId, customerGroupId: null } });
}

export const priceListRepository = {
  findManyByTenant(tenantId: bigint) {
    return prisma.priceList.findMany({
      where: { tenantId },
      include: { items: true },
      orderBy: { name: "asc" },
    });
  },

  findByIdForTenant(tenantId: bigint, id: bigint) {
    return prisma.priceList.findFirst({ where: { id, tenantId }, include: { items: true } });
  },

  create(data: Prisma.PriceListUncheckedCreateInput) {
    return prisma.priceList.create({ data });
  },

  createItem(data: Prisma.PriceListItemUncheckedCreateInput) {
    return prisma.priceListItem.create({ data });
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

  // Walks specificity tiers in order (see Docs/business-rules/pricing.md ->
  // Price Resolution Order), returning the first tier whose matched
  // PriceList *also* has an item for this product at this quantity. A tier
  // matching the PriceList but missing the product falls through to the
  // next tier, per that doc. No tenant-wide default tier — a product with
  // nothing configured at any of these specific tiers has no price, full
  // stop, rather than silently falling back to a default list.
  async resolve(params: ResolveParams): Promise<{ priceListId: bigint; price: Prisma.Decimal } | null> {
    const tiers: Prisma.PriceListWhereInput[] = [];

    if (params.customerId !== undefined) {
      tiers.push({ tenantId: params.tenantId, customerId: params.customerId });
    }
    if (params.warehouseId !== undefined && params.customerGroupId !== undefined) {
      tiers.push({
        tenantId: params.tenantId,
        warehouseId: params.warehouseId,
        customerGroupId: params.customerGroupId,
      });
    }
    if (params.warehouseId !== undefined) {
      tiers.push({ tenantId: params.tenantId, warehouseId: params.warehouseId, customerGroupId: null });
    }
    if (params.customerGroupId !== undefined) {
      tiers.push({ tenantId: params.tenantId, customerGroupId: params.customerGroupId, warehouseId: null });
    }

    for (const where of tiers) {
      const priceList = await prisma.priceList.findFirst({ where });
      if (!priceList) continue;
      const item = await findBestItem(priceList.id, params.productId, params.quantity);
      if (item) {
        return { priceListId: priceList.id, price: item.price };
      }
    }
    return null;
  },

  // Batched sibling of resolve() for a set of products at once, quantity
  // fixed at "buy 1" and with no customer/customerGroup context — the same
  // reduced, warehouse-only tier the store checkout screen already
  // approximates client-side (see app/(store)/store/sales/page.tsx's
  // buildPriceHints). One priceList lookup instead of resolve()'s
  // per-product tier walk, since every product here shares the same
  // warehouse and no customer.
  async findBuyOnePriceItems(
    tenantId: bigint,
    warehouseId: bigint,
    productIds: bigint[],
  ): Promise<PriceListItem[]> {
    if (productIds.length === 0) return [];
    const priceList = await findListForWarehouse(tenantId, warehouseId);
    if (!priceList) return [];
    return prisma.priceListItem.findMany({
      where: { priceListId: priceList.id, productId: { in: productIds }, minQuantity: { lte: 1 } },
      orderBy: { minQuantity: "desc" },
    });
  },

  // Every productId this warehouse's applicable price list has an entry
  // for, at any quantity tier — used to filter a product listing down to
  // "only what's actually priced for this store" (GET /products), not just
  // to price already-known products.
  async findPricedProductIds(tenantId: bigint, warehouseId: bigint): Promise<bigint[]> {
    const priceList = await findListForWarehouse(tenantId, warehouseId);
    if (!priceList) return [];
    const items = await prisma.priceListItem.findMany({
      where: { priceListId: priceList.id },
      select: { productId: true },
      distinct: ["productId"],
    });
    return items.map((item) => item.productId);
  },
};
