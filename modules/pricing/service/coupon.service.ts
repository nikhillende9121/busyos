import { Prisma } from "@prisma/client";
import type { Coupon, CouponProduct, CouponCategory } from "@prisma/client";
import { couponRepository } from "../repository/coupon.repository";
import { AppError } from "@/shared/errors/app-error";
import { webhookService } from "@/modules/webhook/service/webhook.service";
import { buildPagination, type Paginated } from "@/shared/utils/pagination";
import type { CreateCouponDto, CouponListDto, CouponExportDto } from "../dto/coupon.dto";
import type { CouponView } from "../types/coupon.types";

type CouponWithLinks = Coupon & { products: CouponProduct[]; categories: CouponCategory[] };

export const couponService = {
  async list(filter: CouponListDto): Promise<Paginated<CouponView>> {
    const repoFilter = { dateFrom: filter.dateFrom, dateTo: filter.dateTo };
    const skip = (filter.page - 1) * filter.pageSize;
    const [coupons, total] = await Promise.all([
      couponRepository.findManyByTenant(filter.tenantId, { ...repoFilter, skip, take: filter.pageSize }),
      couponRepository.countByTenant(filter.tenantId, repoFilter),
    ]);
    return {
      items: coupons.map(toCouponView),
      pagination: buildPagination(filter.page, filter.pageSize, total),
    };
  },

  // Same filter as list(), but every matching row — no page/pageSize — for
  // GET /coupons/export.
  async exportList(filter: CouponExportDto): Promise<CouponView[]> {
    const coupons = await couponRepository.findManyByTenant(filter.tenantId, {
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    });
    return coupons.map(toCouponView);
  },

  async getById(tenantId: bigint, id: bigint): Promise<CouponView> {
    const coupon = await couponRepository.findByIdForTenant(tenantId, id);
    if (!coupon) {
      throw new AppError("RESOURCE_NOT_FOUND", "Coupon not found");
    }
    return toCouponView(coupon);
  },

  // No update/delete yet — deliberately deferred, same as Discount/PriceList.
  async create(dto: CreateCouponDto): Promise<CouponView> {
    if (dto.warehouseId !== undefined) {
      const warehouse = await couponRepository.findWarehouseForTenant(dto.tenantId, dto.warehouseId);
      if (!warehouse) throw new AppError("VALIDATION_ERROR", "warehouseId does not belong to this tenant");
    }
    if (dto.customerGroupId !== undefined) {
      const group = await couponRepository.findCustomerGroupForTenant(dto.tenantId, dto.customerGroupId);
      if (!group) throw new AppError("VALIDATION_ERROR", "customerGroupId does not belong to this tenant");
    }
    if (dto.customerId !== undefined) {
      const customer = await couponRepository.findCustomerForTenant(dto.tenantId, dto.customerId);
      if (!customer) throw new AppError("VALIDATION_ERROR", "customerId does not belong to this tenant");
    }
    for (const productId of dto.productIds ?? []) {
      const product = await couponRepository.findProductForTenant(dto.tenantId, productId);
      if (!product) {
        throw new AppError(
          "VALIDATION_ERROR",
          `productId ${productId.toString()} does not belong to this tenant`,
        );
      }
    }
    for (const categoryId of dto.categoryIds ?? []) {
      const category = await couponRepository.findCategoryForTenant(dto.tenantId, categoryId);
      if (!category) {
        throw new AppError(
          "VALIDATION_ERROR",
          `categoryId ${categoryId.toString()} does not belong to this tenant`,
        );
      }
    }

    let coupon: Coupon;
    try {
      coupon = await couponRepository.create({
        tenantId: dto.tenantId,
        code: dto.code,
        type: dto.type,
        value: new Prisma.Decimal(dto.value),
        scope: dto.scope,
        warehouseId: dto.warehouseId,
        customerGroupId: dto.customerGroupId,
        customerId: dto.customerId,
        minPurchaseAmount: dto.minPurchaseAmount ? new Prisma.Decimal(dto.minPurchaseAmount) : undefined,
        maxDiscountAmount: dto.maxDiscountAmount ? new Prisma.Decimal(dto.maxDiscountAmount) : undefined,
        usageLimitTotal: dto.usageLimitTotal,
        usageLimitPerCustomer: dto.usageLimitPerCustomer,
        startDate: dto.startDate,
        endDate: dto.endDate,
        stackable: dto.stackable ?? false,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("DUPLICATE_CODE", "A coupon with this code already exists");
      }
      throw error;
    }

    const products: CouponProduct[] = [];
    for (const productId of dto.productIds ?? []) {
      products.push(await couponRepository.linkProduct(coupon.id, productId));
    }
    const categories: CouponCategory[] = [];
    for (const categoryId of dto.categoryIds ?? []) {
      categories.push(await couponRepository.linkCategory(coupon.id, categoryId));
    }

    const view = toCouponView({ ...coupon, products, categories });
    void webhookService.enqueueEvent(dto.tenantId, "COUPON_CREATED", view);
    return view;
  },
};

function toCouponView(coupon: CouponWithLinks): CouponView {
  return {
    id: coupon.id.toString(),
    code: coupon.code,
    type: coupon.type,
    value: coupon.value.toString(),
    scope: coupon.scope,
    warehouseId: coupon.warehouseId?.toString() ?? null,
    customerGroupId: coupon.customerGroupId?.toString() ?? null,
    customerId: coupon.customerId?.toString() ?? null,
    productIds: coupon.products.map((p) => p.productId.toString()),
    categoryIds: coupon.categories.map((c) => c.categoryId.toString()),
    minPurchaseAmount: coupon.minPurchaseAmount?.toString() ?? null,
    maxDiscountAmount: coupon.maxDiscountAmount?.toString() ?? null,
    usageLimitTotal: coupon.usageLimitTotal,
    usageLimitPerCustomer: coupon.usageLimitPerCustomer,
    startDate: coupon.startDate.toISOString(),
    endDate: coupon.endDate?.toISOString() ?? null,
    isActive: coupon.isActive,
    stackable: coupon.stackable,
  };
}
