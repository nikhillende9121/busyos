import { Prisma } from "@prisma/client";
import type { ExchangeDirection, Sale, SaleItem, SaleDiscount } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { saleRepository } from "../repository/sale.repository";
import { saleReturnRepository } from "../repository/sale-return.repository";
import { saleExchangeRepository } from "../repository/sale-exchange.repository";
import type { SaleExchangeWithDetails } from "../repository/sale-exchange.repository";
import { computeProratedRefundUnitPrice, RETURNABLE_SALE_STATUSES, toSaleReturnView } from "./sale-return.service";
import { resolveItemPrice, resolveSaleCharges, toSaleView } from "./sale.service";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { promotionService } from "@/modules/pricing/service/promotion.service";
import { taxService } from "@/modules/pricing/service/tax.service";
import { AppError } from "@/shared/errors/app-error";
import { assertWarehouseAccess } from "@/shared/utils/assert-warehouse-access";
import type { QuoteView } from "@/modules/pricing/types/promotion.types";
import type { CreateSaleExchangeDto, QuoteSaleExchangeDto } from "../dto/sale-exchange.dto";
import type { SaleExchangeView, SaleExchangeQuoteView } from "../types/sale-exchange.types";

export const saleExchangeService = {
  async getById(tenantId: bigint, id: bigint): Promise<SaleExchangeView> {
    const exchange = await saleExchangeRepository.findByIdForTenant(tenantId, id);
    if (!exchange) {
      throw new AppError("RESOURCE_NOT_FOUND", "Sale exchange not found");
    }
    return toSaleExchangeView(exchange);
  },

  async list(tenantId: bigint, scopedWarehouseId: bigint | null = null): Promise<SaleExchangeView[]> {
    const exchanges = await saleExchangeRepository.findManyByTenant(tenantId, scopedWarehouseId);
    return exchanges.map(toSaleExchangeView);
  },

  // One atomic transaction: return the old item(s) (inventory IN), sell the
  // replacement item(s) (inventory OUT), settle the difference as a single
  // Payment, and link all three via SaleExchange — see
  // Docs/business-rules/sale-exchange.md.
  async create(dto: CreateSaleExchangeDto): Promise<SaleExchangeView> {
    const { originalSale, returnLines, resolvedPrices, quote, lineTaxResults, resolvedCharges, direction, differenceAmount } =
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
        const lineTax = lineTaxResults[index];
        const createdItem = await saleRepository.createItem(tx, {
          saleId: newSale.id,
          productId: item.productId,
          quantity: new Prisma.Decimal(item.quantity),
          price: new Prisma.Decimal(resolvedPrices[index]),
          tax: new Prisma.Decimal(lineTax.taxTotal),
        });
        saleItemIdByProductId.set(item.productId.toString(), createdItem.id);

        await saleRepository.createItemTaxes(
          tx,
          lineTax.components.map((component) => ({
            saleItemId: createdItem.id,
            taxRateId: BigInt(lineTax.taxRateId),
            component: component.component,
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

      for (const charge of resolvedCharges) {
        await saleRepository.createCharge(tx, {
          saleId: newSale.id,
          extraChargeId: charge.extraChargeId,
          taxRateId: charge.taxRateId,
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

    return toSaleExchangeView(created);
  },

  // Read-only mirror of create(): same resolveExchange computation
  // (valuing the return side, pricing/discounting/taxing the replacement
  // side, and settling the difference), zero writes — no SaleReturn, no
  // Sale, no Payment, no coupon redemption. Sharing resolveExchange with
  // create() is what guarantees this preview and the eventual persisted
  // result can never disagree — see INVOICE_CALCULATION_LOGIC.md.
  async quote(dto: QuoteSaleExchangeDto): Promise<SaleExchangeQuoteView> {
    const { returnLines, resolvedPrices, quote, lineTaxResults, resolvedCharges, differenceAmount, direction } =
      await resolveExchange(dto);

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
    const chargesTotal = resolvedCharges
      .reduce((sum, charge) => sum.add(charge.amount), new Prisma.Decimal(0))
      .toString();
    const taxTotal = lineTaxResults
      .reduce((sum, lineTax) => sum.add(lineTax.taxTotal), new Prisma.Decimal(0))
      .add(resolvedCharges.reduce((sum, charge) => sum.add(charge.taxAmount), new Prisma.Decimal(0)))
      .toString();

    return {
      returnItems,
      newItems,
      chargesTotal,
      taxTotal,
      differenceAmount: differenceAmount.toString(),
      differenceDirection: direction,
    };
  },
};

type ResolvedExchangeLine = { item: SaleItem; quantity: Prisma.Decimal; refundAmount: Prisma.Decimal };

// Shared by create() and quote(): values the returned side exactly like a
// standalone SaleReturn, prices+discounts+taxes the replacement side
// through the same pipeline as a normal new Sale, and computes the
// settlement difference. No writes.
async function resolveExchange(dto: CreateSaleExchangeDto | QuoteSaleExchangeDto): Promise<{
  originalSale: Sale & { items: SaleItem[]; discounts: SaleDiscount[] };
  returnLines: ResolvedExchangeLine[];
  returnRefundTotal: Prisma.Decimal;
  resolvedPrices: string[];
  quote: QuoteView;
  lineTaxResults: Awaited<ReturnType<typeof taxService.computeLinesTax>>;
  resolvedCharges: Awaited<ReturnType<typeof resolveSaleCharges>>;
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
    lines: dto.newItems.map((item, index) => ({
      productId: item.productId,
      categoryId: products.get(item.productId.toString())?.categoryId ?? undefined,
      quantity: item.quantity,
      unitPrice: resolvedPrices[index],
    })),
  });

  const taxContext = await taxService.resolveContext({
    tenantId: dto.tenantId,
    warehouseId: originalSale.warehouseId,
    customerId: originalSale.customerId ?? undefined,
  });
  const lineTaxResults = await taxService.computeLinesTax(
    dto.tenantId,
    taxContext,
    quote.lines.map((line) => ({ productId: BigInt(line.productId), lineTotal: line.lineTotal })),
  );
  const resolvedCharges = await resolveSaleCharges(dto.tenantId, taxContext, dto.extraChargeIds, quote.grandTotal);

  // Tax-inclusive — this is what the customer actually owes for the new
  // items, unlike the tax-exclusive return side above.
  const newItemsTotal = lineTaxResults
    .reduce((sum, lineTax) => sum.add(lineTax.taxTotal), new Prisma.Decimal(quote.grandTotal))
    .add(
      resolvedCharges.reduce((sum, charge) => sum.add(charge.amount).add(charge.taxAmount), new Prisma.Decimal(0)),
    );

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
    lineTaxResults,
    resolvedCharges,
    newItemsTotal,
    difference,
    direction,
    differenceAmount,
  };
}

function toSaleExchangeView(exchange: SaleExchangeWithDetails): SaleExchangeView {
  return {
    id: exchange.id.toString(),
    saleReturn: toSaleReturnView(exchange.saleReturn),
    newSale: toSaleView(exchange.newSale),
    differenceAmount: exchange.differenceAmount.toString(),
    differenceDirection: exchange.differenceDirection,
    createdAt: exchange.createdAt.toISOString(),
  };
}
