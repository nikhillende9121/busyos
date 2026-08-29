import { Prisma } from "@prisma/client";
import type { ExchangeDirection, Sale, SaleItem, SaleDiscount, TaxComponent } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { saleRepository } from "../repository/sale.repository";
import { saleReturnRepository } from "../repository/sale-return.repository";
import { saleExchangeRepository } from "../repository/sale-exchange.repository";
import type { SaleExchangeWithDetails } from "../repository/sale-exchange.repository";
import { computeProratedRefundUnitPrice, RETURNABLE_SALE_STATUSES, toSaleReturnView } from "./sale-return.service";
import { resolveItemPrice, resolveTaxInclusive, toSaleView } from "./sale.service";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { promotionService } from "@/modules/pricing/service/promotion.service";
import { AppError } from "@/shared/errors/app-error";
import { assertWarehouseAccess } from "@/shared/utils/assert-warehouse-access";
import { buildPagination, type Paginated } from "@/shared/utils/pagination";
import type { QuoteView } from "@/modules/pricing/types/promotion.types";
import type {
  CreateSaleExchangeDto,
  QuoteSaleExchangeDto,
  SaleExchangeListDto,
  SaleExchangeExportDto,
} from "../dto/sale-exchange.dto";
import type { SaleExchangeView, SaleExchangeQuoteView } from "../types/sale-exchange.types";

export const saleExchangeService = {
  async getById(tenantId: bigint, id: bigint): Promise<SaleExchangeView> {
    const [exchange, taxInclusive] = await Promise.all([
      saleExchangeRepository.findByIdForTenant(tenantId, id),
      resolveTaxInclusive(tenantId),
    ]);
    if (!exchange) {
      throw new AppError("RESOURCE_NOT_FOUND", "Sale exchange not found");
    }
    return toSaleExchangeView(exchange, taxInclusive);
  },

  async list(filter: SaleExchangeListDto): Promise<Paginated<SaleExchangeView>> {
    const repoFilter = {
      warehouseId: filter.scopedWarehouseId ?? null,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    };
    const skip = (filter.page - 1) * filter.pageSize;
    const [exchanges, total, taxInclusive] = await Promise.all([
      saleExchangeRepository.findManyByTenant(filter.tenantId, { ...repoFilter, skip, take: filter.pageSize }),
      saleExchangeRepository.countByTenant(filter.tenantId, repoFilter),
      // One tenant, one setting — resolved once for the whole page.
      resolveTaxInclusive(filter.tenantId),
    ]);
    return {
      items: exchanges.map((exchange) => toSaleExchangeView(exchange, taxInclusive)),
      pagination: buildPagination(filter.page, filter.pageSize, total),
    };
  },

  // Same filter as list(), but every matching row — no page/pageSize — for
  // GET /sale-exchanges/export.
  async exportList(filter: SaleExchangeExportDto): Promise<SaleExchangeView[]> {
    const [exchanges, taxInclusive] = await Promise.all([
      saleExchangeRepository.findManyByTenant(filter.tenantId, {
        warehouseId: filter.scopedWarehouseId ?? null,
        dateFrom: filter.dateFrom,
        dateTo: filter.dateTo,
      }),
      resolveTaxInclusive(filter.tenantId),
    ]);
    return exchanges.map((exchange) => toSaleExchangeView(exchange, taxInclusive));
  },

  // One atomic transaction: return the old item(s) (inventory IN), sell the
  // replacement item(s) (inventory OUT), settle the difference as a single
  // Payment, and link all three via SaleExchange — see
  // Docs/business-rules/sale-exchange.md.
  async create(dto: CreateSaleExchangeDto): Promise<SaleExchangeView> {
    const { originalSale, returnLines, resolvedPrices, quote, direction, differenceAmount } =
      await resolveExchange(dto);

    const created = await prisma.$transaction(async (tx) => {
      // 1. Return leg — mirrors saleReturnService.create's body exactly.
      const saleReturn = await saleReturnRepository.create(tx, {
        saleId: dto.saleId,
        reason: dto.reason,
        createdBy: dto.createdBy,
      });
      for (const line of returnLines) {
        await saleReturnRepository.createItem(tx, {
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
        await inventoryService.recordMovement(
          {
            tenantId: dto.tenantId,
            warehouseId: originalSale.warehouseId,
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

      // 2. Replacement sale leg — created straight into COMPLETED (stock
      // moves immediately), since like a return this records a physical
      // exchange that already happened at the counter, never a DRAFT cart.
      const newSale = await saleRepository.create(tx, {
        tenantId: dto.tenantId,
        customerId: originalSale.customerId ?? null,
        warehouseId: originalSale.warehouseId,
        channel: "POS",
        status: "COMPLETED",
        saleDate: new Date(),
        createdBy: dto.createdBy,
      });

      const saleItemIdByProductId = new Map<string, bigint>();
      for (const [index, item] of dto.newItems.entries()) {
        const lineTax = quote.lines[index];
        const createdItem = await saleRepository.createItem(tx, {
          saleId: newSale.id,
          productId: item.productId,
          quantity: new Prisma.Decimal(item.quantity),
          price: new Prisma.Decimal(resolvedPrices[index]),
          tax: new Prisma.Decimal(lineTax.tax),
        });
        saleItemIdByProductId.set(item.productId.toString(), createdItem.id);

        await saleRepository.createItemTaxes(
          tx,
          lineTax.taxes.map((component) => ({
            saleItemId: createdItem.id,
            // Always populated for a line's own tax (unlike a charge's,
            // which is legitimately nullable when the charge isn't taxable).
            taxRateId: BigInt(component.taxRateId!),
            // Always one of the 4 GST components — computeLineTax
            // (tax.service.ts) is the sole source of this string, the
            // QuoteLineTaxComponentView view type just doesn't re-narrow it.
            component: component.component as TaxComponent,
            ratePercent: new Prisma.Decimal(component.ratePercent),
            amount: new Prisma.Decimal(component.amount),
          })),
        );

        await inventoryService.recordMovement(
          {
            tenantId: dto.tenantId,
            warehouseId: originalSale.warehouseId,
            productId: item.productId,
            transactionType: "SALE_OUT",
            quantityDelta: `-${item.quantity}`,
            referenceType: "SALE",
            referenceId: newSale.id,
            createdBy: dto.createdBy,
          },
          tx,
        );
      }

      await promotionService.applyQuoteToSale(tx, {
        tenantId: dto.tenantId,
        saleId: newSale.id,
        customerId: originalSale.customerId ?? undefined,
        quote,
        saleItemIdByProductId,
      });

      for (const charge of quote.charges) {
        await saleRepository.createCharge(tx, {
          saleId: newSale.id,
          extraChargeId: BigInt(charge.extraChargeId),
          taxRateId: charge.taxRateId ? BigInt(charge.taxRateId) : null,
          name: charge.name,
          amount: new Prisma.Decimal(charge.amount),
          taxAmount: new Prisma.Decimal(charge.taxAmount),
        });
      }

      // 3. Settle the difference as a single Payment. Attached to the new
      // Sale when the customer owes; attached to the SaleReturn (via the
      // generic referenceType/referenceId — Payment has no returnId FK)
      // when a refund is due instead. See Docs/DATABASE.md -> Payments.
      if (direction !== "EVEN") {
        await tx.payment.create({
          data:
            direction === "CUSTOMER_OWES"
              ? {
                  tenantId: dto.tenantId,
                  saleId: newSale.id,
                  referenceType: "SALE",
                  referenceId: newSale.id,
                  amount: differenceAmount,
                  paymentMethod: dto.paymentMethod,
                  createdBy: dto.createdBy,
                }
              : {
                  tenantId: dto.tenantId,
                  referenceType: "SALE_RETURN",
                  referenceId: saleReturn.id,
                  amount: differenceAmount,
                  paymentMethod: dto.paymentMethod,
                  createdBy: dto.createdBy,
                },
        });
      }

      // 4. Link record.
      return saleExchangeRepository.create(tx, {
        saleReturnId: saleReturn.id,
        newSaleId: newSale.id,
        differenceAmount,
        differenceDirection: direction,
        createdBy: dto.createdBy,
      });
    });

    return toSaleExchangeView(created, await resolveTaxInclusive(dto.tenantId));
  },

  // Read-only mirror of create(): same resolveExchange computation
  // (valuing the return side, pricing/discounting/taxing the replacement
  // side, and settling the difference), zero writes — no SaleReturn, no
  // Sale, no Payment, no coupon redemption. Sharing resolveExchange with
  // create() is what guarantees this preview and the eventual persisted
  // result can never disagree — see INVOICE_CALCULATION_LOGIC.md.
  async quote(dto: QuoteSaleExchangeDto): Promise<SaleExchangeQuoteView> {
    const { returnLines, resolvedPrices, quote, differenceAmount, direction } = await resolveExchange(dto);

    const returnItems = returnLines.map((line) => ({
      saleItemId: line.item.id.toString(),
      productId: line.item.productId.toString(),
      quantity: line.quantity.toString(),
      refundAmount: line.refundAmount.toString(),
    }));
    const newItems = dto.newItems.map((item, index) => ({
      productId: item.productId.toString(),
      quantity: item.quantity,
      amount: quote.lines[index]?.lineTotal ?? resolvedPrices[index],
    }));

    return {
      returnItems,
      newItems,
      chargesTotal: quote.chargesTotal,
      taxTotal: quote.taxTotal,
      differenceAmount: differenceAmount.toString(),
      differenceDirection: direction,
    };
  },
};

type ResolvedExchangeLine = { item: SaleItem; quantity: Prisma.Decimal; refundAmount: Prisma.Decimal };

// Shared by create() and quote(): values the returned side exactly like a
// standalone SaleReturn, prices+discounts+taxes the replacement side
// through the same pipeline as a normal new Sale (promotionService.quote()
// now computes tax/charges internally — see promotion.service.ts), and
// computes the settlement difference. No writes.
async function resolveExchange(dto: CreateSaleExchangeDto | QuoteSaleExchangeDto): Promise<{
  originalSale: Sale & { items: SaleItem[]; discounts: SaleDiscount[] };
  returnLines: ResolvedExchangeLine[];
  returnRefundTotal: Prisma.Decimal;
  resolvedPrices: string[];
  quote: QuoteView;
  newItemsTotal: Prisma.Decimal;
  difference: Prisma.Decimal;
  direction: ExchangeDirection;
  differenceAmount: Prisma.Decimal;
}> {
  const originalSale = await saleReturnRepository.findSaleForTenant(dto.tenantId, dto.saleId);
  if (!originalSale) {
    throw new AppError("VALIDATION_ERROR", "saleId does not belong to this tenant");
  }
  assertWarehouseAccess({ warehouseId: dto.scopedWarehouseId ?? null }, originalSale.warehouseId);
  if (!RETURNABLE_SALE_STATUSES.has(originalSale.status)) {
    throw new AppError("VALIDATION_ERROR", `Cannot exchange items from a sale in status ${originalSale.status}`);
  }

  // --- Value the returned side, exactly like a standalone SaleReturn ---
  const itemsById = new Map(originalSale.items.map((item) => [item.id.toString(), item]));
  let returnRefundTotal = new Prisma.Decimal(0);
  const returnLines: ResolvedExchangeLine[] = dto.returnItems.map((returnItem) => {
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
    // Tax-exclusive, matching SaleReturnItem.refundAmount's existing
    // convention — an exchange must value a return no differently than a
    // standalone one (see Docs/business-rules/sale-return.md).
    const proratedUnitPrice = computeProratedRefundUnitPrice(item, originalSale.items, originalSale.discounts);
    const refundAmount = proratedUnitPrice.mul(quantity);
    returnRefundTotal = returnRefundTotal.add(refundAmount);
    return { item, quantity, refundAmount };
  });

  // --- Price the replacement side, same pipeline as a normal new Sale ---
  const customer = originalSale.customerId
    ? await saleRepository.findCustomerForTenant(dto.tenantId, originalSale.customerId)
    : null;
  const products = new Map<string, { categoryId: bigint | null }>();
  // Index-aligned with dto.newItems (not keyed by productId) so two lines
  // for the same product resolve and price independently.
  const resolvedPrices: string[] = [];
  for (const newItem of dto.newItems) {
    const product = await saleRepository.findProductForTenant(dto.tenantId, newItem.productId);
    if (!product) {
      throw new AppError(
        "VALIDATION_ERROR",
        `productId ${newItem.productId.toString()} does not belong to this tenant`,
      );
    }
    products.set(newItem.productId.toString(), { categoryId: product.categoryId });
    resolvedPrices.push(
      await resolveItemPrice({
        tenantId: dto.tenantId,
        productId: newItem.productId,
        warehouseId: originalSale.warehouseId,
        quantity: newItem.quantity,
        customerGroupId: customer?.customerGroupId ?? undefined,
        customerId: originalSale.customerId ?? undefined,
      }),
    );
  }

  const quote = await promotionService.quote({
    tenantId: dto.tenantId,
    warehouseId: originalSale.warehouseId,
    customerId: originalSale.customerId ?? undefined,
    couponCode: dto.couponCode,
    extraChargeIds: dto.extraChargeIds,
    taxInclusive: dto.taxInclusive,
    lines: dto.newItems.map((item, index) => ({
      productId: item.productId,
      categoryId: products.get(item.productId.toString())?.categoryId ?? undefined,
      quantity: item.quantity,
      unitPrice: resolvedPrices[index],
    })),
  });

  // What the customer actually owes for the new items — tax included,
  // unlike the tax-exclusive return side above. quote.grandTotal is already
  // inclusive-aware (see promotion.service.ts): it adds line/charge tax on
  // top under exclusive pricing, and leaves it embedded (not double-added)
  // under inclusive pricing — same reasoning as sale.service.ts's
  // toSaleView. See Docs/business-rules/taxation.md -> Tax-Inclusive vs.
  // Tax-Exclusive Pricing.
  const newItemsTotal = new Prisma.Decimal(quote.grandTotal);

  const difference = newItemsTotal.sub(returnRefundTotal);
  const direction: ExchangeDirection = difference.isZero()
    ? "EVEN"
    : difference.isPositive()
      ? "CUSTOMER_OWES"
      : "REFUND_DUE";
  const differenceAmount = difference.abs();

  return {
    originalSale,
    returnLines,
    returnRefundTotal,
    resolvedPrices,
    quote,
    newItemsTotal,
    difference,
    direction,
    differenceAmount,
  };
}

function toSaleExchangeView(exchange: SaleExchangeWithDetails, taxInclusive: boolean): SaleExchangeView {
  return {
    id: exchange.id.toString(),
    saleReturn: toSaleReturnView(exchange.saleReturn),
    newSale: toSaleView(exchange.newSale, taxInclusive),
    differenceAmount: exchange.differenceAmount.toString(),
    differenceDirection: exchange.differenceDirection,
    createdAt: exchange.createdAt.toISOString(),
  };
}
