import { Prisma } from "@prisma/client";
import type { PriceList, PriceListItem } from "@prisma/client";
import { priceListRepository } from "../repository/price-list.repository";
import { AppError } from "@/shared/errors/app-error";
import type { CreatePriceListDto, ResolvePriceDto } from "../dto/price-list.dto";
import type { PriceListView, ResolvedPriceView } from "../types/price-list.types";

export const priceListService = {
  async list(tenantId: bigint): Promise<PriceListView[]> {
    const priceLists = await priceListRepository.findManyByTenant(tenantId);
    return priceLists.map(toPriceListView);
  },

  async getById(tenantId: bigint, id: bigint): Promise<PriceListView> {
    const priceList = await priceListRepository.findByIdForTenant(tenantId, id);
    if (!priceList) {
      throw new AppError("RESOURCE_NOT_FOUND", "Price list not found");
    }
    return toPriceListView(priceList);
  },

  // No update/delete yet — deliberately deferred. Deleting a PriceList
  // needs a "don't remove the last tenant-wide default" guard (see
  // prisma/schema.prisma comment on PriceList) that isn't implemented; until
  // it is, treat price lists as create-only and manage corrections by
  // creating a new one.
  async create(dto: CreatePriceListDto): Promise<PriceListView> {
    if (dto.warehouseId !== undefined) {
      const warehouse = await priceListRepository.findWarehouseForTenant(dto.tenantId, dto.warehouseId);
      if (!warehouse) {
        throw new AppError("VALIDATION_ERROR", "warehouseId does not belong to this tenant");
      }
    }
    if (dto.customerGroupId !== undefined) {
      const group = await priceListRepository.findCustomerGroupForTenant(dto.tenantId, dto.customerGroupId);
      if (!group) {
        throw new AppError("VALIDATION_ERROR", "customerGroupId does not belong to this tenant");
      }
    }
    if (dto.customerId !== undefined) {
      const customer = await priceListRepository.findCustomerForTenant(dto.tenantId, dto.customerId);
      if (!customer) {
        throw new AppError("VALIDATION_ERROR", "customerId does not belong to this tenant");
      }
    }
    for (const item of dto.items) {
      const product = await priceListRepository.findProductForTenant(dto.tenantId, item.productId);
      if (!product) {
        throw new AppError(
          "VALIDATION_ERROR",
          `productId ${item.productId.toString()} does not belong to this tenant`,
        );
      }
    }

    const priceList = await priceListRepository.create({
      tenantId: dto.tenantId,
      name: dto.name,
      warehouseId: dto.warehouseId,
      customerGroupId: dto.customerGroupId,
      customerId: dto.customerId,
      currency: dto.currency,
      isDefault: dto.isDefault ?? false,
    });

    const items: PriceListItem[] = [];
    for (const item of dto.items) {
      const created = await priceListRepository.createItem({
        priceListId: priceList.id,
        productId: item.productId,
        price: new Prisma.Decimal(item.price),
        minQuantity: item.minQuantity ? new Prisma.Decimal(item.minQuantity) : undefined,
      });
      items.push(created);
    }

    return toPriceListView({ ...priceList, items });
  },

  async resolvePrice(dto: ResolvePriceDto): Promise<ResolvedPriceView> {
    const resolved = await priceListRepository.resolve({
      tenantId: dto.tenantId,
      productId: dto.productId,
      warehouseId: dto.warehouseId,
      customerGroupId: dto.customerGroupId,
      customerId: dto.customerId,
      quantity: new Prisma.Decimal(dto.quantity),
    });
    if (!resolved) {
      throw new AppError("RESOURCE_NOT_FOUND", "No price is configured for this product");
    }
    return { priceListId: resolved.priceListId.toString(), price: resolved.price.toString() };
  },
};

function toPriceListView(priceList: PriceList & { items: PriceListItem[] }): PriceListView {
  return {
    id: priceList.id.toString(),
    name: priceList.name,
    warehouseId: priceList.warehouseId?.toString() ?? null,
    customerGroupId: priceList.customerGroupId?.toString() ?? null,
    customerId: priceList.customerId?.toString() ?? null,
    currency: priceList.currency,
    isDefault: priceList.isDefault,
    items: priceList.items.map((item) => ({
      id: item.id.toString(),
      productId: item.productId.toString(),
      price: item.price.toString(),
      minQuantity: item.minQuantity.toString(),
    })),
    createdAt: priceList.createdAt.toISOString(),
  };
}
