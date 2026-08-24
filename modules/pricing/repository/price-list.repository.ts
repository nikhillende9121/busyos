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

// Applicable PriceLists for a warehouse with no customer/
// customerGroup context — shared by findBuyOnePriceItems and
// findPricedProductIds below, ordered newest-first so recently created lists
// take precedence.
function findListsForWarehouse(tenantId: bigint, warehouseId: bigint) {
  return prisma.priceList.findMany({
    where: { tenantId, warehouseId, customerGroupId: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
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
  // Price Resolution Order), checking PriceLists in newest-first order within
  // each tier. Returns the first tier and price list whose item matches this
  // product at this quantity.
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
      const priceLists = await prisma.priceList.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      for (const priceList of priceLists) {
        const item = await findBestItem(priceList.id, params.productId, params.quantity);
        if (item) {
          return { priceListId: priceList.id, price: item.price };
        }
      }
    }
    return null;
  },

  // Batched sibling of resolve() for a set of products at once, quantity
  // fixed at "buy 1" and with no customer/customerGroup context.
  // Checks warehouse price lists from newest to oldest so that newer price list
  // entries override older ones for any product.
  async findBuyOnePriceItems(
    tenantId: bigint,
    warehouseId: bigint,
    productIds: bigint[],
  ): Promise<PriceListItem[]> {
    if (productIds.length === 0) return [];
    const priceLists = await findListsForWarehouse(tenantId, warehouseId);
    if (priceLists.length === 0) return [];

    const itemMap = new Map<string, PriceListItem>();
    const remainingProductIds = new Set(productIds.map((id) => id.toString()));

    for (const priceList of priceLists) {
      if (remainingProductIds.size === 0) break;
      const targetIds = Array.from(remainingProductIds).map((id) => BigInt(id));
      const items = await prisma.priceListItem.findMany({
        where: { priceListId: priceList.id, productId: { in: targetIds }, minQuantity: { lte: 1 } },
        orderBy: { minQuantity: "desc" },
      });
      for (const item of items) {
        const key = item.productId.toString();
        if (!itemMap.has(key)) {
          itemMap.set(key, item);
          remainingProductIds.delete(key);
        }
      }
    }
    return Array.from(itemMap.values());
  },

  // Every productId this warehouse's applicable price lists have an entry
  // for, at any quantity tier — used to filter a product listing down to
  // "only what's actually priced for this store" (GET /products).
  async findPricedProductIds(tenantId: bigint, warehouseId: bigint): Promise<bigint[]> {
    const priceLists = await findListsForWarehouse(tenantId, warehouseId);
    if (priceLists.length === 0) return [];
    const priceListIds = priceLists.map((pl) => pl.id);
    const items = await prisma.priceListItem.findMany({
      where: { priceListId: { in: priceListIds } },
      select: { productId: true },
      distinct: ["productId"],
    });
    return items.map((item) => item.productId);
  },
};
