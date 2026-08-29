import { Prisma } from "@prisma/client";
import type { Discount, DiscountProduct, DiscountCategory } from "@prisma/client";
import { discountRepository } from "../repository/discount.repository";
import { AppError } from "@/shared/errors/app-error";
import { buildPagination, type Paginated } from "@/shared/utils/pagination";
import type { CreateDiscountDto, DiscountListDto, DiscountExportDto } from "../dto/discount.dto";
import type { DiscountView } from "../types/discount.types";

type DiscountWithLinks = Discount & { products: DiscountProduct[]; categories: DiscountCategory[] };

export const discountService = {
  async list(filter: DiscountListDto): Promise<Paginated<DiscountView>> {
    const repoFilter = { dateFrom: filter.dateFrom, dateTo: filter.dateTo };
    const skip = (filter.page - 1) * filter.pageSize;
    const [discounts, total] = await Promise.all([
      discountRepository.findManyByTenant(filter.tenantId, { ...repoFilter, skip, take: filter.pageSize }),
      discountRepository.countByTenant(filter.tenantId, repoFilter),
    ]);
    return {
      items: discounts.map(toDiscountView),
      pagination: buildPagination(filter.page, filter.pageSize, total),
    };
  },

  // Same filter as list(), but every matching row — no page/pageSize — for
  // GET /discounts/export.
  async exportList(filter: DiscountExportDto): Promise<DiscountView[]> {
    const discounts = await discountRepository.findManyByTenant(filter.tenantId, {
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    });
    return discounts.map(toDiscountView);
  },

  async getById(tenantId: bigint, id: bigint): Promise<DiscountView> {
    const discount = await discountRepository.findByIdForTenant(tenantId, id);
    if (!discount) {
      throw new AppError("RESOURCE_NOT_FOUND", "Discount not found");
    }
    return toDiscountView(discount);
  },

  // No update/delete yet — deliberately deferred, same as PriceList. See
  // Docs/business-rules/discounts-and-coupons.md.
  async create(dto: CreateDiscountDto): Promise<DiscountView> {
    if (dto.warehouseId !== undefined) {
      const warehouse = await discountRepository.findWarehouseForTenant(dto.tenantId, dto.warehouseId);
      if (!warehouse) throw new AppError("VALIDATION_ERROR", "warehouseId does not belong to this tenant");
    }
    if (dto.customerGroupId !== undefined) {
      const group = await discountRepository.findCustomerGroupForTenant(dto.tenantId, dto.customerGroupId);
      if (!group) throw new AppError("VALIDATION_ERROR", "customerGroupId does not belong to this tenant");
    }
    if (dto.customerId !== undefined) {
      const customer = await discountRepository.findCustomerForTenant(dto.tenantId, dto.customerId);
      if (!customer) throw new AppError("VALIDATION_ERROR", "customerId does not belong to this tenant");
    }
    for (const productId of dto.productIds ?? []) {
      const product = await discountRepository.findProductForTenant(dto.tenantId, productId);
      if (!product) {
        throw new AppError(
          "VALIDATION_ERROR",
          `productId ${productId.toString()} does not belong to this tenant`,
        );
      }
    }
    for (const categoryId of dto.categoryIds ?? []) {
      const category = await discountRepository.findCategoryForTenant(dto.tenantId, categoryId);
      if (!category) {
        throw new AppError(
          "VALIDATION_ERROR",
          `categoryId ${categoryId.toString()} does not belong to this tenant`,
        );
      }
    }

    const discount = await discountRepository.create({
      tenantId: dto.tenantId,
      name: dto.name,
      type: dto.type,
      value: new Prisma.Decimal(dto.value),
      scope: dto.scope,
      warehouseId: dto.warehouseId,
      customerGroupId: dto.customerGroupId,
      customerId: dto.customerId,
      minPurchaseAmount: dto.minPurchaseAmount ? new Prisma.Decimal(dto.minPurchaseAmount) : undefined,
      maxDiscountAmount: dto.maxDiscountAmount ? new Prisma.Decimal(dto.maxDiscountAmount) : undefined,
      startDate: dto.startDate,
      endDate: dto.endDate,
      stackable: dto.stackable ?? false,
      priority: dto.priority ?? 0,
    });

    const products: DiscountProduct[] = [];
    for (const productId of dto.productIds ?? []) {
      products.push(await discountRepository.linkProduct(discount.id, productId));
    }
    const categories: DiscountCategory[] = [];
    for (const categoryId of dto.categoryIds ?? []) {
      categories.push(await discountRepository.linkCategory(discount.id, categoryId));
    }

    return toDiscountView({ ...discount, products, categories });
  },
};

function toDiscountView(discount: DiscountWithLinks): DiscountView {
  return {
    id: discount.id.toString(),
    name: discount.name,
    type: discount.type,
    value: discount.value.toString(),
    scope: discount.scope,
    warehouseId: discount.warehouseId?.toString() ?? null,
    customerGroupId: discount.customerGroupId?.toString() ?? null,
    customerId: discount.customerId?.toString() ?? null,
    productIds: discount.products.map((p) => p.productId.toString()),
    categoryIds: discount.categories.map((c) => c.categoryId.toString()),
    minPurchaseAmount: discount.minPurchaseAmount?.toString() ?? null,
    maxDiscountAmount: discount.maxDiscountAmount?.toString() ?? null,
    startDate: discount.startDate.toISOString(),
    endDate: discount.endDate?.toISOString() ?? null,
    isActive: discount.isActive,
    stackable: discount.stackable,
    priority: discount.priority,
  };
}
