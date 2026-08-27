import { Prisma } from "@prisma/client";
import type { Sale, SaleChannel, SaleItem, SaleItemTax, SaleDiscount, SaleCharge, SaleStatus, Customer, Tenant, TenantSetting, Product } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { saleRepository } from "../repository/sale.repository";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { promotionService } from "@/modules/pricing/service/promotion.service";
import { priceListService } from "@/modules/pricing/service/price-list.service";
import { taxService } from "@/modules/pricing/service/tax.service";
import type { TaxContext } from "@/modules/pricing/types/tax.types";
import { AppError } from "@/shared/errors/app-error";
import { assertWarehouseAccess } from "@/shared/utils/assert-warehouse-access";
import { rbacLookup } from "@/shared/middleware/rbac-lookup";
import type { CreateSaleDto, SaleListDto } from "../dto/sale.dto";
import type { SaleView } from "../types/sale.types";

// Channel-dependent lifecycle — see Docs/business-rules/sales.md and
// Docs/ARCHITECTURE.md -> Sales Channels. POS sales skip straight past the
// payment-pending state a card/online checkout needs, and finish through
// complete() rather than the online fulfillment pipeline below.
function initialStatus(channel: SaleChannel): SaleStatus {
  return channel === "POS" ? "COMPLETED" : "PENDING_PAYMENT";
}

// Online/marketplace/phone fulfillment: CONFIRMED -> PROCESSING -> PACKED
// -> SHIPPED -> DELIVERED. This v1 does not support PARTIALLY_SHIPPED
// (per-item partial shipment tracking) or creating an actual Shipment/
// DeliveryProvider record — ship() just advances the Sale's own status.
// Flagged here rather than silently narrowed.
const NEXT_FULFILLMENT_STATUS: Partial<Record<SaleStatus, SaleStatus>> = {
  CONFIRMED: "PROCESSING",
  PROCESSING: "PACKED",
  PACKED: "SHIPPED",
  SHIPPED: "DELIVERED",
};

// Cancellable any time before SHIPPED — matches Docs/business-rules/sales.md
// -> Cancellation ("only before SHIPPED" for online channels). Once stock
// has left (CONFIRMED/COMPLETED and later, until SHIPPED), cancelling must reverse it.
const CANCELLABLE_STATUSES = new Set<SaleStatus>([
  "DRAFT",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "PROCESSING",
  "PACKED",
  "COMPLETED",
]);
const STOCK_DECREMENTED_STATUSES = new Set<SaleStatus>(["CONFIRMED", "PROCESSING", "PACKED", "COMPLETED"]);

export const saleService = {
  async list(filter: SaleListDto): Promise<SaleView[]> {
    const sales = await saleRepository.findManyByTenant(filter.tenantId, {
      status: filter.status as never,
      channel: filter.channel as never,
      warehouseId: filter.scopedWarehouseId ?? undefined,
    });
    return sales.map((sale) => toSaleView(sale));
  },

  async getById(tenantId: bigint, saleId: bigint, scopedWarehouseId: bigint | null = null): Promise<SaleView> {
    const sale = await saleRepository.findByIdForTenant(tenantId, saleId);
    if (!sale) {
      throw new AppError("RESOURCE_NOT_FOUND", "Sale not found");
    }
    assertWarehouseAccess({ warehouseId: scopedWarehouseId }, sale.warehouseId);
    return toSaleView(sale);
  },

  // A coupon (if supplied) is applied — and, if it has a usage limit,
  // counted as redeemed — at creation time, not at confirm. See
  // Docs/business-rules/discounts-and-coupons.md -> Applying at Creation
  // vs. Confirmation for the accepted tradeoff (an abandoned DRAFT sale can
  // consume a limited coupon's usage slot). Discounts/coupon are resolved
  // via modules/pricing -> Sales calls PricingService, never its
  // repositories directly, per MODULE_GUIDE.md.
  async create(dto: CreateSaleDto): Promise<SaleView> {
    assertWarehouseAccess({ warehouseId: dto.scopedWarehouseId ?? null }, dto.warehouseId);

    const isCustomerFeatureEnabled = await rbacLookup.isFeatureEnabledForTenant(dto.tenantId, "CUSTOMER");
    let customer: Customer | null = null;
    if (isCustomerFeatureEnabled) {
      if (!dto.customerId) {
        throw new AppError("VALIDATION_ERROR", "Customer is required when customer feature is enabled in your plan");
      }
      customer = await saleRepository.findCustomerForTenant(dto.tenantId, dto.customerId);
      if (!customer) {
        throw new AppError("VALIDATION_ERROR", "customerId does not belong to this tenant");
      }
    } else if (dto.customerId) {
      customer = await saleRepository.findCustomerForTenant(dto.tenantId, dto.customerId);
      if (!customer) {
        throw new AppError("VALIDATION_ERROR", "customerId does not belong to this tenant");
      }
    }

    const warehouse = await saleRepository.findWarehouseForTenant(dto.tenantId, dto.warehouseId);
    if (!warehouse) {
      throw new AppError("VALIDATION_ERROR", "warehouseId does not belong to this tenant");
    }
    const products = new Map<string, { categoryId: bigint | null }>();
    // Index-aligned with dto.items (not keyed by productId) so two lines
    // for the same product resolve and price independently.
    const resolvedPrices: string[] = [];
    for (const item of dto.items) {
      const product = await saleRepository.findProductForTenant(dto.tenantId, item.productId);
      if (!product) {
        throw new AppError(
          "VALIDATION_ERROR",
          `productId ${item.productId.toString()} does not belong to this tenant`,
        );
      }
      products.set(item.productId.toString(), { categoryId: product.categoryId });
      resolvedPrices.push(
        await resolveItemPrice({
          tenantId: dto.tenantId,
          productId: item.productId,
          warehouseId: dto.warehouseId,
          quantity: item.quantity,
          customerGroupId: customer?.customerGroupId ?? undefined,
          customerId: dto.customerId ?? undefined,
        }),
      );
    }

    // Computed before opening the transaction: an invalid/inapplicable
    // coupon should fail fast, not after the sale row already exists.
    const quote = await promotionService.quote({
      tenantId: dto.tenantId,
      warehouseId: dto.warehouseId,
      customerId: dto.customerId ?? undefined,
      customerGroupId: customer?.customerGroupId ?? undefined,
      couponCode: dto.couponCode,
      lines: dto.items.map((item, index) => ({
        productId: item.productId,
        categoryId: products.get(item.productId.toString())?.categoryId ?? undefined,
        quantity: item.quantity,
        unitPrice: resolvedPrices[index],
      })),
    });

    // Tax is computed on quote().lineTotal (post-discount/coupon) — see
    // Docs/business-rules/discounts-and-coupons.md's order of operations.
    // Also computed before opening the transaction, same reasoning as the
    // quote itself: a missing tax rate should fail fast.
    const taxContext = await taxService.resolveContext({
      tenantId: dto.tenantId,
      warehouseId: dto.warehouseId,
      customerId: dto.customerId ?? undefined,
      taxInclusivePricing: dto.taxInclusive,
    });
    const lineTaxResults = await taxService.computeLinesTax(
      dto.tenantId,
      taxContext,
      quote.lines.map((line) => ({ productId: BigInt(line.productId), lineTotal: line.lineTotal })),
    );

    const resolvedCharges = await resolveSaleCharges(dto.tenantId, taxContext, dto.extraChargeIds, quote.grandTotal, dto.channel);

    const sale = await prisma.$transaction(async (tx) => {
      const status = initialStatus(dto.channel);
      const created = await saleRepository.create(tx, {
        tenantId: dto.tenantId,
        customerId: dto.customerId ?? null,
        warehouseId: dto.warehouseId,
        channel: dto.channel,
        status,
        saleDate: dto.saleDate,
        createdBy: dto.createdBy,
      });

      const saleItemIdByProductId = new Map<string, bigint>();
      for (const [index, item] of dto.items.entries()) {
        const lineTax = lineTaxResults[index];
        const createdItem = await saleRepository.createItem(tx, {
          saleId: created.id,
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
      }

      await promotionService.applyQuoteToSale(tx, {
        tenantId: dto.tenantId,
        saleId: created.id,
        customerId: dto.customerId ?? undefined,
        quote,
        saleItemIdByProductId,
      });

      for (const charge of resolvedCharges) {
        await saleRepository.createCharge(tx, {
          saleId: created.id,
          extraChargeId: charge.extraChargeId,
          taxRateId: charge.taxRateId,
          name: charge.name,
          amount: new Prisma.Decimal(charge.amount),
          taxAmount: new Prisma.Decimal(charge.taxAmount),
        });
      }

      if (status === "COMPLETED") {
        for (const item of dto.items) {
          await inventoryService.recordMovement(
            {
              tenantId: dto.tenantId,
              warehouseId: dto.warehouseId,
              productId: item.productId,
              transactionType: "SALE_OUT",
              quantityDelta: `-${item.quantity}`,
              referenceType: "SALE",
              referenceId: created.id,
            },
            tx,
          );
        }
      }

      // Read back as one consistent snapshot (items+taxes, discounts,
      // charges) rather than hand-assembling the response from partial
      // writes above — still inside the same transaction, so it's atomic
      // with everything just written.
      return saleRepository.findByIdTx(tx, created.id);
    });

    return toSaleView(sale);
  },

  // Stock decreases here, on confirmation — not at DRAFT/PENDING_PAYMENT
  // creation — see Docs/business-rules/sales.md -> Inventory Impact Timing.
  // Each line's SALE_OUT movement runs inside the same transaction as the
  // status change, and inventoryService.recordMovement's own insufficient-
  // stock guard (see modules/inventory/service/inventory.service.ts) is
  // what actually enforces "can't sell more than available" — not
  // duplicated here.
  async confirm(tenantId: bigint, saleId: bigint, scopedWarehouseId: bigint | null = null): Promise<SaleView> {
    const sale = await saleRepository.findByIdForTenant(tenantId, saleId);
    if (!sale) {
      throw new AppError("RESOURCE_NOT_FOUND", "Sale not found");
    }
    assertWarehouseAccess({ warehouseId: scopedWarehouseId }, sale.warehouseId);
    if (sale.status !== initialStatus(sale.channel)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Cannot confirm a ${sale.channel} sale in status ${sale.status}`,
      );
    }

    const targetStatus: SaleStatus = sale.channel === "POS" ? "COMPLETED" : "CONFIRMED";

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        await inventoryService.recordMovement(
          {
            tenantId,
            warehouseId: sale.warehouseId,
            productId: item.productId,
            transactionType: "SALE_OUT",
            quantityDelta: `-${item.quantity.toString()}`,
            referenceType: "SALE",
            referenceId: sale.id,
          },
          tx,
        );
      }
      const newSale = await saleRepository.updateStatus(tx, sale.id, targetStatus);
      return { ...newSale, items: sale.items, discounts: sale.discounts, charges: sale.charges };
    });

    return toSaleView(updated);
  },

  // POS-only shortcut (CONFIRMED -> COMPLETED, no further inventory change —
  // stock already moved at confirm). Online/marketplace/phone sales use
  // process/pack/ship/deliver instead, ending at DELIVERED, not COMPLETED.
  async complete(tenantId: bigint, saleId: bigint, scopedWarehouseId: bigint | null = null): Promise<SaleView> {
    const sale = await saleRepository.findByIdForTenant(tenantId, saleId);
    if (!sale) {
      throw new AppError("RESOURCE_NOT_FOUND", "Sale not found");
    }
    assertWarehouseAccess({ warehouseId: scopedWarehouseId }, sale.warehouseId);
    if (sale.channel !== "POS") {
      throw new AppError(
        "VALIDATION_ERROR",
        `complete() is a POS-only shortcut — a ${sale.channel} sale uses process/pack/ship/deliver`,
      );
    }
    if (sale.status !== "CONFIRMED") {
      throw new AppError("VALIDATION_ERROR", `Only a CONFIRMED sale can be completed, not ${sale.status}`);
    }
    const updated = await saleRepository.updateStatus(prisma, saleId, "COMPLETED");
    return toSaleView({ ...updated, items: sale.items, discounts: sale.discounts, charges: sale.charges });
  },

  // The online/marketplace/phone fulfillment pipeline — no inventory impact
  // at any of these steps, since stock already left at confirm(). Each
  // method only advances one specific step, matching the explicit style of
  // confirm/complete/cancel rather than one generic "advance" call, so an
  // out-of-order request (e.g. shipping before packing) fails clearly.
  async process(tenantId: bigint, saleId: bigint, scopedWarehouseId: bigint | null = null): Promise<SaleView> {
    return advanceFulfillment(tenantId, saleId, "CONFIRMED", "PROCESSING", scopedWarehouseId);
  },

  async pack(tenantId: bigint, saleId: bigint, scopedWarehouseId: bigint | null = null): Promise<SaleView> {
    return advanceFulfillment(tenantId, saleId, "PROCESSING", "PACKED", scopedWarehouseId);
  },

  async ship(tenantId: bigint, saleId: bigint, scopedWarehouseId: bigint | null = null): Promise<SaleView> {
    return advanceFulfillment(tenantId, saleId, "PACKED", "SHIPPED", scopedWarehouseId);
  },

  async deliver(tenantId: bigint, saleId: bigint, scopedWarehouseId: bigint | null = null): Promise<SaleView> {
    return advanceFulfillment(tenantId, saleId, "SHIPPED", "DELIVERED", scopedWarehouseId);
  },

  // Cancelling a sale that already decremented stock (CONFIRMED, PROCESSING,
  // or PACKED) must reverse that movement, never silently edit the balance
  // — see Docs/business-rules/sales.md -> Cancellation. SALE_RETURN_IN is
  // reused as the reversing ledger type rather than adding a new enum
  // value, per that same doc's "reversing SALE_RETURN-style ledger entry"
  // wording. Not cancellable once SHIPPED — use a SaleReturn instead.
  async cancel(tenantId: bigint, saleId: bigint, scopedWarehouseId: bigint | null = null): Promise<SaleView> {
    const sale = await saleRepository.findByIdForTenant(tenantId, saleId);
    if (!sale) {
      throw new AppError("RESOURCE_NOT_FOUND", "Sale not found");
    }
    assertWarehouseAccess({ warehouseId: scopedWarehouseId }, sale.warehouseId);
    if (!CANCELLABLE_STATUSES.has(sale.status)) {
      throw new AppError("VALIDATION_ERROR", `Cannot cancel a sale in status ${sale.status}`);
    }

    if (!STOCK_DECREMENTED_STATUSES.has(sale.status)) {
      const updated = await saleRepository.updateStatus(prisma, saleId, "CANCELLED");
      return toSaleView({ ...updated, items: sale.items, discounts: sale.discounts, charges: sale.charges });
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        await inventoryService.recordMovement(
          {
            tenantId,
            warehouseId: sale.warehouseId,
            productId: item.productId,
            transactionType: "SALE_RETURN_IN",
            quantityDelta: item.quantity.toString(),
            referenceType: "SALE",
            referenceId: sale.id,
          },
          tx,
        );
      }
      const newSale = await saleRepository.updateStatus(tx, sale.id, "CANCELLED");
      return { ...newSale, items: sale.items, discounts: sale.discounts, charges: sale.charges };
    });

    return toSaleView(updated);
  },
};

async function advanceFulfillment(
  tenantId: bigint,
  saleId: bigint,
  requiredStatus: SaleStatus,
  nextStatus: SaleStatus,
  scopedWarehouseId: bigint | null = null,
): Promise<SaleView> {
  const sale = await saleRepository.findByIdForTenant(tenantId, saleId);
  if (!sale) {
    throw new AppError("RESOURCE_NOT_FOUND", "Sale not found");
  }
  assertWarehouseAccess({ warehouseId: scopedWarehouseId }, sale.warehouseId);
  if (sale.channel === "POS") {
    throw new AppError(
      "VALIDATION_ERROR",
      "POS sales don't use the online fulfillment pipeline — see complete()",
    );
  }
  if (sale.status !== requiredStatus || NEXT_FULFILLMENT_STATUS[sale.status] !== nextStatus) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Cannot move a sale in status ${sale.status} to ${nextStatus}`,
    );
  }
  const updated = await saleRepository.updateStatus(prisma, saleId, nextStatus);
  return toSaleView({ ...updated, items: sale.items, discounts: sale.discounts, charges: sale.charges });
}

// The server is the sole source of truth for what a line item costs — a
// client (web or Android) can no longer submit its own price. Resolved
// fresh from the current price-list configuration for this product+store
// on every call, same tier order/quantity-break logic as GET /pricing/resolve
// (modules/pricing/service/price-list.service.ts's resolvePrice). No price
// list configuring this product for this warehouse is a hard failure, not
// a fallback to some other price — see Docs/business-rules/pricing.md.
//
// Exported for sale-exchange.service.ts to reuse for its replacement-items
// leg — those are priced no differently than a normal Sale's items.
export async function resolveItemPrice(params: {
  tenantId: bigint;
  productId: bigint;
  warehouseId: bigint;
  quantity: string;
  customerGroupId?: bigint;
  customerId?: bigint;
}): Promise<string> {
  try {
    const resolved = await priceListService.resolvePrice(params);
    return resolved.price;
  } catch (error) {
    if (error instanceof AppError && error.code === "RESOURCE_NOT_FOUND") {
      throw new AppError(
        "VALIDATION_ERROR",
        `No price is configured for productId ${params.productId.toString()} at this warehouse`,
      );
    }
    throw error;
  }
}

// Resolves each requested ExtraCharge (flat, or a percentage of the
// post-discount grand total), and taxes it if the catalog entry is marked
// taxable — computed before the transaction opens, same reasoning as the
// quote/tax-line computation above.
//
import { extraChargeRepository } from "@/modules/extra-charge/repository/extra-charge.repository";

// Exported for sale-exchange.service.ts to reuse for its replacement-items
// leg — an exchange charges extra fees no differently than a normal Sale.
export async function resolveSaleCharges(
  tenantId: bigint,
  taxContext: TaxContext,
  extraChargeIds: bigint[] | undefined,
  grandTotal: string,
  channel?: string,
): Promise<
  { extraChargeId: bigint; taxRateId: bigint | null; name: string; amount: string; taxAmount: string }[]
> {
  let targetChargeIds = extraChargeIds ?? [];
  if (targetChargeIds.length === 0 && channel && extraChargeRepository?.findManyByTenant) {
    try {
      const activeCharges = (await extraChargeRepository.findManyByTenant(tenantId)) || [];
      targetChargeIds = activeCharges
        .filter((c) => {
          if (!c.isActive) return false;
          if (!c.applicableChannels) return true;
          const allowed = c.applicableChannels.split(",").map((s) => s.trim()).filter(Boolean);
          return allowed.length === 0 || allowed.includes(channel);
        })
        .map((c) => c.id);
    } catch {
      targetChargeIds = [];
    }
  }

  if (targetChargeIds.length === 0) {
    return [];
  }

  const resolved = [];
  for (const extraChargeId of targetChargeIds) {
    const charge = await saleRepository.findExtraChargeForTenant(tenantId, extraChargeId);
    if (!charge) {
      throw new AppError(
        "VALIDATION_ERROR",
        `extraChargeId ${extraChargeId.toString()} does not belong to this tenant`,
      );
    }

    if (channel && charge.applicableChannels) {
      const allowedChannels = charge.applicableChannels.split(",").map((c) => c.trim()).filter(Boolean);
      if (allowedChannels.length > 0 && !allowedChannels.includes(channel)) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Extra charge "${charge.name}" is not applicable for ${channel} sales channel`,
        );
      }
    }

    const amount =
      charge.calcType === "FLAT" ? charge.value : new Prisma.Decimal(grandTotal).mul(charge.value).div(100);

    let taxAmount = new Prisma.Decimal(0);
    if (charge.isTaxable && charge.taxRateId) {
      const chargeTax = await taxService.computeChargeTax(tenantId, taxContext, {
        amount: amount.toString(),
        taxRateId: charge.taxRateId,
      });
      taxAmount = new Prisma.Decimal(chargeTax.taxTotal);
    }

    resolved.push({
      extraChargeId,
      taxRateId: charge.isTaxable ? charge.taxRateId : null,
      name: charge.name,
      amount: amount.toString(),
      taxAmount: taxAmount.toString(),
    });
  }
  return resolved;
}

// Exported for sale-exchange.service.ts to reuse when assembling its
// combined view — a sale nested inside an exchange reads no differently
// than a standalone one.
export function toSaleView(
  sale: Sale & {
    customer?: Customer | null;
    tenant?: (Tenant & { settings?: TenantSetting | null }) | null;
    items?: (SaleItem & { product?: Product | null; taxes?: SaleItemTax[] })[];
    discounts?: SaleDiscount[];
    charges?: SaleCharge[];
  },
  taxInclusive: boolean = true,
): SaleView {
  const prefix = sale.tenant?.settings?.invoicePrefix ?? "INV-";
  const year = sale.saleDate ? new Date(sale.saleDate).getFullYear() : new Date().getFullYear();
  const saleNumber = `${prefix}${year}-${sale.id.toString().padStart(4, "0")}`;

  const customerName = sale.customer?.name ?? null;
  const customerPhone = sale.customer?.phone ?? null;
  const customerEmail = sale.customer?.email ?? null;

  const items = (sale.items ?? []).map((item) => {
    const quantityNum = Number(item.quantity);
    const priceNum = Number(item.price);
    const amountNum = quantityNum * priceNum;
    return {
      id: item.id.toString(),
      productId: item.productId.toString(),
      productName: item.product?.name ?? null,
      quantity: item.quantity.toString(),
      price: item.price.toString(),
      amount: amountNum.toFixed(2),
      tax: item.tax.toString(),
      taxes: (item.taxes ?? []).map((tax) => ({
        taxRateId: tax.taxRateId?.toString() ?? null,
        component: tax.component,
        ratePercent: tax.ratePercent.toString(),
        amount: tax.amount.toString(),
      })),
    };
  });

  const discounts = (sale.discounts ?? []).map((discount) => ({
    id: discount.id.toString(),
    saleItemId: discount.saleItemId?.toString() ?? null,
    discountId: discount.discountId?.toString() ?? null,
    couponId: discount.couponId?.toString() ?? null,
    amount: discount.amount.toString(),
    isCoupon: discount.couponId !== null,
  }));

  const charges = (sale.charges ?? []).map((charge) => ({
    id: charge.id.toString(),
    name: charge.name,
    amount: charge.amount.toString(),
    taxAmount: charge.taxAmount.toString(),
  }));

  const subtotalNum = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const discountTotalNum = discounts.reduce((sum, discount) => sum + Number(discount.amount), 0);
  const itemTaxTotalNum = items.reduce((sum, item) => sum + Number(item.tax), 0);
  const chargesAmountNum = charges.reduce((sum, charge) => sum + Number(charge.amount), 0);
  const chargesTaxTotalNum = charges.reduce((sum, charge) => sum + Number(charge.taxAmount), 0);

  const totalTaxNum = itemTaxTotalNum + chargesTaxTotalNum;
  const totalAmountNum = subtotalNum - discountTotalNum + totalTaxNum + chargesAmountNum;

  return {
    id: sale.id.toString(),
    saleNumber,
    customerId: sale.customerId ? sale.customerId.toString() : null,
    customerName,
    customerPhone,
    customerEmail,
    warehouseId: sale.warehouseId.toString(),
    channel: sale.channel,
    status: sale.status,
    saleDate: sale.saleDate.toISOString(),
    taxInclusive,
    items,
    discounts,
    charges,
    subtotal: subtotalNum.toFixed(2),
    taxAmount: totalTaxNum.toFixed(2),
    totalAmount: totalAmountNum.toFixed(2),
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
  };
}
