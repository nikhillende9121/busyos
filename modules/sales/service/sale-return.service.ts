import { Prisma } from "@prisma/client";
import type { SaleReturn, SaleReturnItem, SaleItem, SaleDiscount, SaleStatus, Product } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { saleReturnRepository } from "../repository/sale-return.repository";
import { saleRepository } from "../repository/sale.repository";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { creditService } from "@/modules/credit/service/credit.service";
import { AppError } from "@/shared/errors/app-error";
import { assertWarehouseAccess } from "@/shared/utils/assert-warehouse-access";
import { buildPagination, type Paginated } from "@/shared/utils/pagination";
import type {
  CreateSaleReturnDto,
  QuoteSaleReturnDto,
  SaleReturnListDto,
  SaleReturnExportDto,
} from "../dto/sale-return.dto";
import type { SaleReturnView, SaleReturnQuoteView } from "../types/sale-return.types";

export type ItemWithReturn = SaleReturnItem & { saleItem: SaleItem };

// A return only makes sense once stock has actually left — DRAFT/
// PENDING_PAYMENT sales never decremented inventory, and a CANCELLED sale
// already reversed whatever it took (see sales.md -> Cancellation).
// Exported: an exchange's returned side is subject to the same rule.
export const RETURNABLE_SALE_STATUSES = new Set<SaleStatus>(["CONFIRMED", "COMPLETED"]);

export const saleReturnService = {
  async list(filter: SaleReturnListDto): Promise<Paginated<SaleReturnView>> {
    const repoFilter = {
      saleId: filter.saleId,
      warehouseId: filter.scopedWarehouseId ?? null,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    };
    const skip = (filter.page - 1) * filter.pageSize;
    const [returns, total] = await Promise.all([
      saleReturnRepository.findManyByTenant(filter.tenantId, { ...repoFilter, skip, take: filter.pageSize }),
      saleReturnRepository.countByTenant(filter.tenantId, repoFilter),
    ]);
    return {
      items: returns.map(toSaleReturnView),
      pagination: buildPagination(filter.page, filter.pageSize, total),
    };
  },

  // Same filter as list(), but every matching row — no page/pageSize — for
  // GET /sale-returns/export.
  async exportList(filter: SaleReturnExportDto): Promise<SaleReturnView[]> {
    const returns = await saleReturnRepository.findManyByTenant(filter.tenantId, {
      saleId: filter.saleId,
      warehouseId: filter.scopedWarehouseId ?? null,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    });
    return returns.map(toSaleReturnView);
  },

  async getById(tenantId: bigint, returnId: bigint): Promise<SaleReturnView> {
    const saleReturn = await saleReturnRepository.findByIdForTenant(tenantId, returnId);
    if (!saleReturn) {
      throw new AppError("RESOURCE_NOT_FOUND", "Sale return not found");
    }
    return toSaleReturnView(saleReturn);
  },

  // No status/confirm step, same reasoning as PurchaseReturn: a return is
  // recorded as a single atomic event after the physical return already
  // happened. Each line's inventory credit (SALE_RETURN_IN), its
  // discount-prorated refundAmount, and its returnedQuantity update all
  // commit atomically with the SaleReturnItem record.
  async create(dto: CreateSaleReturnDto): Promise<SaleReturnView> {
    const { sale, lines } = await resolveReturnLines(dto);

    // A return against a sale that was paid via CREDIT reduces the
    // customer's outstanding due amount (a "credit note") instead of — or
    // in addition to — any other refund mechanism, automatically, with no
    // separate manual step. This codebase only tracks one payment method
    // per sale (no split-tender), so the sale either was or wasn't a
    // CREDIT sale — see Docs/credit_module_plan.md §9.
    const creditPayment = sale.customerId ? await saleRepository.findCreditPaymentForSale(dto.saleId) : null;
    const totalRefundAmount = lines.reduce((sum, line) => sum.add(line.refundAmount), new Prisma.Decimal(0));

    const created = await prisma.$transaction(async (tx) => {
      const saleReturn = await saleReturnRepository.create(tx, {
        saleId: dto.saleId,
        reason: dto.reason,
        createdBy: dto.createdBy,
      });

      const items: ItemWithReturn[] = [];
      for (const line of lines) {
        const createdItem = await saleReturnRepository.createItem(tx, {
          saleReturnId: saleReturn.id,
          saleItemId: line.item.id,
          quantity: line.quantity,
          refundAmount: line.refundAmount,
        });

        await saleReturnRepository.updateItemReturnedQuantity(
          tx,
          line.item.id,
          line.item.returnedQuantity.add(line.quantity),
        );

        // A batch-tracked product's line credits back the exact batch(es)
        // it was originally fulfilled from, prorated by each batch's
        // share of the line's total quantity — same proration shape as
        // computeProratedRefundUnitPrice's discount math above, applied
        // to batches instead of money. See
        // Docs/batch_expiry_tracking_plan.md §10.
        if (line.item.product?.trackBatches) {
          const saleItemBatches = await saleRepository.findItemBatches(tx, line.item.id);
          for (const batch of saleItemBatches) {
            const share = line.quantity.mul(batch.quantity).div(line.item.quantity);
            if (share.isZero()) continue;
            await inventoryService.recordMovement(
              {
                tenantId: dto.tenantId,
                warehouseId: sale.warehouseId,
                productId: line.item.productId,
                transactionType: "SALE_RETURN_IN",
                quantityDelta: share.toString(),
                referenceType: "SALE_RETURN",
                referenceId: saleReturn.id,
                createdBy: dto.createdBy,
                productBatchId: batch.productBatchId,
              },
              tx,
            );
          }
        } else {
          await inventoryService.recordMovement(
            {
              tenantId: dto.tenantId,
              warehouseId: sale.warehouseId,
              productId: line.item.productId,
              transactionType: "SALE_RETURN_IN",
              quantityDelta: line.quantity.toString(),
              referenceType: "SALE_RETURN",
              referenceId: saleReturn.id,
              createdBy: dto.createdBy,
            },
            tx,
          );
        }

        items.push({ ...createdItem, saleItem: line.item });
      }

      if (creditPayment && sale.customerId && totalRefundAmount.greaterThan(0)) {
        await creditService.recordCreditNote(
          {
            tenantId: dto.tenantId,
            customerId: sale.customerId,
            amount: totalRefundAmount.toString(),
            referenceId: saleReturn.id,
            createdBy: dto.createdBy,
          },
          tx,
        );
      }

      return { ...saleReturn, items };
    });

    return toSaleReturnView(created);
  },

  // Read-only mirror of create(): same validation, same
  // computeProratedRefundUnitPrice call per line, zero writes — see
  // Docs/business-rules/sale-return.md -> Preview Endpoint. Sharing
  // resolveReturnLines with create() is what guarantees this number and the
  // eventual persisted refundAmount can never disagree.
  async quote(dto: QuoteSaleReturnDto): Promise<SaleReturnQuoteView> {
    const { lines } = await resolveReturnLines(dto);

    const items = lines.map((line) => ({
      saleItemId: line.item.id.toString(),
      productId: line.item.productId.toString(),
      quantity: line.quantity.toString(),
      refundAmount: line.refundAmount.toString(),
    }));
    const totalRefundAmount = lines
      .reduce((sum, line) => sum.add(line.refundAmount), new Prisma.Decimal(0))
      .toString();

    return { items, totalRefundAmount };
  },
};

type ResolvedReturnLine = {
  item: SaleItem & { product: Product | null };
  quantity: Prisma.Decimal;
  refundAmount: Prisma.Decimal;
};

// Shared by create() and quote(): finds+authorizes the sale, validates every
// requested line belongs to it and doesn't exceed what's left returnable,
// and prices each line via computeProratedRefundUnitPrice. No writes.
async function resolveReturnLines(
  dto: CreateSaleReturnDto | QuoteSaleReturnDto,
): Promise<{ sale: NonNullable<Awaited<ReturnType<typeof saleReturnRepository.findSaleForTenant>>>; lines: ResolvedReturnLine[] }> {
  const sale = await saleReturnRepository.findSaleForTenant(dto.tenantId, dto.saleId);
  if (!sale) {
    throw new AppError("VALIDATION_ERROR", "saleId does not belong to this tenant");
  }
  assertWarehouseAccess({ warehouseId: dto.scopedWarehouseId ?? null }, sale.warehouseId);
  if (!RETURNABLE_SALE_STATUSES.has(sale.status)) {
    throw new AppError("VALIDATION_ERROR", `Cannot return items from a sale in status ${sale.status}`);
  }

  const itemsById = new Map(sale.items.map((item) => [item.id.toString(), item]));
  const lines: ResolvedReturnLine[] = [];
  for (const returnItem of dto.items) {
    const item = itemsById.get(returnItem.saleItemId.toString());
    if (!item) {
      throw new AppError(
        "VALIDATION_ERROR",
        `saleItemId ${returnItem.saleItemId.toString()} does not belong to this sale`,
      );
    }
    const quantity = new Prisma.Decimal(returnItem.quantity);
    const remaining = item.quantity.sub(item.returnedQuantity);
    if (quantity.greaterThan(remaining)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Cannot return ${quantity.toString()} for product ${item.productId.toString()} — only ${remaining.toString()} remains returnable`,
      );
    }
    const proratedUnitPrice = computeProratedRefundUnitPrice(item, sale.items, sale.discounts);
    const refundAmount = proratedUnitPrice.mul(quantity);
    lines.push({ item, quantity, refundAmount });
  }

  return { sale, lines };
}

// Prorates the original sale's discounts onto one line, so a return
// refunds what the customer actually paid, not the undiscounted list price
// — see Docs/business-rules/sale-return.md -> Discount-Aware Refunds.
//
// Line-level SaleDiscount rows (saleItemId set) reduce only their own
// line. Order-level rows (saleItemId null — an ORDER-scope coupon) are
// apportioned across every line by that line's share of the sale's total
// subtotal, since an order-wide reduction was never attributed to one
// specific line in the first place.
//
// Exported for sale-exchange.service.ts to reuse — an exchange's returned
// side must value items exactly like a standalone return, not a second,
// possibly-diverging implementation of the same discount-proration rule.
export function computeProratedRefundUnitPrice(
  item: SaleItem,
  allItems: SaleItem[],
  allDiscounts: SaleDiscount[],
): Prisma.Decimal {
  const lineSubtotal = item.price.mul(item.quantity);
  if (lineSubtotal.isZero()) {
    return new Prisma.Decimal(0);
  }

  const lineLevelDiscount = allDiscounts
    .filter((discount) => discount.saleItemId !== null && discount.saleItemId === item.id)
    .reduce((sum, discount) => sum.add(discount.amount), new Prisma.Decimal(0));

  const orderLevelDiscount = allDiscounts
    .filter((discount) => discount.saleItemId === null)
    .reduce((sum, discount) => sum.add(discount.amount), new Prisma.Decimal(0));

  const saleSubtotal = allItems.reduce((sum, i) => sum.add(i.price.mul(i.quantity)), new Prisma.Decimal(0));
  const proratedOrderDiscount = saleSubtotal.isZero()
    ? new Prisma.Decimal(0)
    : orderLevelDiscount.mul(lineSubtotal).div(saleSubtotal);

  const effectiveLineTotal = lineSubtotal.sub(lineLevelDiscount).sub(proratedOrderDiscount);
  const clamped = effectiveLineTotal.isNegative() ? new Prisma.Decimal(0) : effectiveLineTotal;
  return clamped.div(item.quantity);
}

// Exported for sale-exchange.service.ts to reuse when assembling its
// combined view — a return nested inside an exchange reads no differently
// than a standalone one.
export function toSaleReturnView(saleReturn: SaleReturn & { items: ItemWithReturn[] }): SaleReturnView {
  const items = saleReturn.items.map((item) => ({
    id: item.id.toString(),
    saleItemId: item.saleItemId.toString(),
    productId: item.saleItem.productId.toString(),
    quantity: item.quantity.toString(),
    refundAmount: item.refundAmount.toString(),
  }));
  const totalRefundAmount = saleReturn.items
    .reduce((sum, item) => sum.add(item.refundAmount), new Prisma.Decimal(0))
    .toString();

  return {
    id: saleReturn.id.toString(),
    saleId: saleReturn.saleId.toString(),
    reason: saleReturn.reason,
    items,
    totalRefundAmount,
    createdAt: saleReturn.createdAt.toISOString(),
  };
}
