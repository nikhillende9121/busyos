import type { ProductBatch } from "@prisma/client";
import { productBatchRepository } from "../repository/product-batch.repository";
import { productService } from "@/modules/product/service/product.service";
import { buildPagination, type Paginated } from "@/shared/utils/pagination";
import type { ProductBatchView } from "../types/inventory.types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ListProductBatchesDto = {
  tenantId: bigint;
  warehouseId?: bigint;
  productId?: bigint;
  expiringWithinDays?: number;
  page: number;
  pageSize: number;
  now?: Date;
};

export const productBatchService = {
  async list(dto: ListProductBatchesDto): Promise<Paginated<ProductBatchView>> {
    const now = dto.now ?? new Date();
    const filter = {
      warehouseId: dto.warehouseId,
      productId: dto.productId,
      expiringBefore:
        dto.expiringWithinDays !== undefined ? new Date(now.getTime() + dto.expiringWithinDays * DAY_MS) : undefined,
    };
    const skip = (dto.page - 1) * dto.pageSize;
    const [batches, total] = await Promise.all([
      productBatchRepository.listByTenant(dto.tenantId, { ...filter, skip, take: dto.pageSize }),
      productBatchRepository.countByTenant(dto.tenantId, filter),
    ]);

    const productIds = [...new Set(batches.map((batch) => batch.productId))];
    const products = await productService.getManyByIds(dto.tenantId, productIds);
    const productNameById = new Map(products.map((product) => [product.id, product.name]));

    return {
      items: batches.map((batch) => toProductBatchView(batch, productNameById, now)),
      pagination: buildPagination(dto.page, dto.pageSize, total),
    };
  },
};

function toProductBatchView(
  batch: ProductBatch,
  productNameById: Map<string, string>,
  now: Date,
): ProductBatchView {
  const daysUntilExpiry = batch.expiryDate
    ? Math.ceil((batch.expiryDate.getTime() - now.getTime()) / DAY_MS)
    : null;
  return {
    id: batch.id.toString(),
    warehouseId: batch.warehouseId.toString(),
    productId: batch.productId.toString(),
    productName: productNameById.get(batch.productId.toString()) ?? null,
    batchNumber: batch.batchNumber,
    expiryDate: batch.expiryDate?.toISOString() ?? null,
    manufacturedDate: batch.manufacturedDate?.toISOString() ?? null,
    quantity: batch.quantity.toString(),
    daysUntilExpiry,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  };
}
