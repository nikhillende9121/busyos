import { Prisma } from "@prisma/client";
import type { SaleReturn, SaleReturnItem, SaleItem, SaleDiscount, SaleStatus } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { saleReturnRepository } from "../repository/sale-return.repository";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { AppError } from "@/shared/errors/app-error";
import { assertWarehouseAccess } from "@/shared/utils/assert-warehouse-access";
import type { CreateSaleReturnDto } from "../dto/sale-return.dto";
import type { SaleReturnView } from "../types/sale-return.types";

export type ItemWithReturn = SaleReturnItem & { saleItem: SaleItem };

// A return only makes sense once stock has actually left — DRAFT/
// PENDING_PAYMENT sales never decremented inventory, and a CANCELLED sale
// already reversed whatever it took (see sales.md -> Cancellation).
// Exported: an exchange's returned side is subject to the same rule.
export const RETURNABLE_SALE_STATUSES = new Set<SaleStatus>(["CONFIRMED", "COMPLETED"]);

export const saleReturnService = {
  async list(tenantId: bigint, saleId?: bigint, scopedWarehouseId: bigint | null = null): Promise<SaleReturnView[]> {
    const returns = await saleReturnRepository.findManyByTenant(tenantId, {
      saleId,
      warehouseId: scopedWarehouseId,
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
    const sale = await saleReturnRepository.findSaleForTenant(dto.tenantId, dto.saleId);
    if (!sale) {
      throw new AppError("VALIDATION_ERROR", "saleId does not belong to this tenant");
    }
    assertWarehouseAccess({ warehouseId: dto.scopedWarehouseId ?? null }, sale.warehouseId);
    if (!RETURNABLE_SALE_STATUSES.has(sale.status)) {
      throw new AppError("VALIDATION_ERROR", `Cannot return items from a sale in status ${sale.status}`);
    }

    const itemsById = new Map(sale.items.map((item) => [item.id.toString(), item]));
    for (const returnItem of dto.items) {
      const item = itemsById.get(returnItem.saleItemId.toString());
      if (!item) {
        throw new AppError(
          "VALIDATION_ERROR",
          `saleItemId ${returnItem.saleItemId.toString()} does not belong to this sale`,
        );
      }
      const remaining = item.quantity.sub(item.returnedQuantity);
      const returning = new Prisma.Decimal(returnItem.quantity);
      if (returning.greaterThan(remaining)) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Cannot return ${returning.toString()} for product ${item.productId.toString()} — only ${remaining.toString()} remains returnable`,
        );
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const saleReturn = await saleReturnRepository.create(tx, {
        saleId: dto.saleId,
        reason: dto.reason,
        createdBy: dto.createdBy,
      });

      const items: ItemWithReturn[] = [];
      for (const returnItem of dto.items) {
        const item = itemsById.get(returnItem.saleItemId.toString())!;
        const returnQuantity = new Prisma.Decimal(returnItem.quantity);
        const proratedUnitPrice = computeProratedRefundUnitPrice(item, sale.items, sale.discounts);
        const refundAmount = proratedUnitPrice.mul(returnQuantity);

        const createdItem = await saleReturnRepository.createItem(tx, {
          saleReturnId: saleReturn.id,
          saleItemId: item.id,
          quantity: returnQuantity,
          refundAmount,
        });

        await saleReturnRepository.updateItemReturnedQuantity(
          tx,
          item.id,
          item.returnedQuantity.add(returnItem.quantity),
        );

        await inventoryService.recordMovement(
          {
            tenantId: dto.tenantId,
            warehouseId: sale.warehouseId,
            productId: item.productId,
            transactionType: "SALE_RETURN_IN",
            quantityDelta: returnItem.quantity,
            referenceType: "SALE_RETURN",
            referenceId: saleReturn.id,
            createdBy: dto.createdBy,
          },
          tx,
        );

        items.push({ ...createdItem, saleItem: item });
      }

      return { ...saleReturn, items };
    });

    return toSaleReturnView(created);
  },
};

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
