import { Prisma } from "@prisma/client";
import type { Sale, SaleChannel, SaleItem, SaleItemTax, SaleDiscount, SaleCharge, SaleStatus, Customer, Tenant, TenantSetting, Product, TaxComponent } from "@prisma/client";
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
import { userRepository } from "@/modules/user/repository/user.repository";
import { buildPagination, type Paginated } from "@/shared/utils/pagination";
import type { CreateSaleDto, SaleListDto, SaleExportDto } from "../dto/sale.dto";
import type { SaleView } from "../types/sale.types";

// Channel-dependent lifecycle — see Docs/business-rules/sales.md and
// Docs/ARCHITECTURE.md -> Sales Channels. POS sales skip straight past the
// payment-pending state a card/online checkout needs, and finish through
// complete() rather than the online fulfillment pipeline below.
function initialStatus(channel: SaleChannel): SaleStatus {
  return channel === "POS" ? "COMPLETED" : "PENDING_PAYMENT";
}

// `toSaleView` needs to know whether *this* tenant's pricing is tax-inclusive
// to total a sale correctly (see the comment on it below) — every read path
// (list/get/lifecycle actions) resolves it fresh via this helper rather than
// hardcoding a default, since `create()` is the only place a `TaxContext` is
// already in scope.
//
// NOTE: this reads the tenant's *current* setting, not what was in effect
// when the sale was actually created — correct as long as a tenant doesn't
// flip `taxInclusivePricing` after sales already exist under the old value.
// Nothing on `Sale` itself records which mode a given sale was computed
// under (unlike `SaleItemTax`, which snapshots its own rate/component so it
// never depends on the live `TaxRate` row). If that ever becomes a real
// problem, the fix is a `Sale.taxInclusive` column snapshotted at creation
// time, the same way `SaleItemTax` already snapshots its rate.
export async function resolveTaxInclusive(tenantId: bigint): Promise<boolean> {
  return taxService.resolveTaxInclusivePricing(tenantId);
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
  async list(filter: SaleListDto): Promise<Paginated<SaleView>> {
    const repoFilter = {
      status: filter.status as never,
      channel: filter.channel as never,
      warehouseId: filter.scopedWarehouseId ?? undefined,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    };
    const skip = (filter.page - 1) * filter.pageSize;
    const [sales, total, taxInclusive] = await Promise.all([
      saleRepository.findManyByTenant(filter.tenantId, { ...repoFilter, skip, take: filter.pageSize }),
      saleRepository.countByTenant(filter.tenantId, repoFilter),
      // One tenant, one setting — resolved once for the whole page rather
      // than once per sale.
      resolveTaxInclusive(filter.tenantId),
    ]);
    return {
      items: sales.map((sale) => toSaleView(sale, taxInclusive)),
      pagination: buildPagination(filter.page, filter.pageSize, total),
    };
  },

  // Same filter as list(), but every matching row — no page/pageSize — for
  // GET /sales/export (see modules/sales/controller/sale.controller.ts).
  async exportList(filter: SaleExportDto): Promise<SaleView[]> {
    const repoFilter = {
      status: filter.status as never,
      channel: filter.channel as never,
      warehouseId: filter.scopedWarehouseId ?? undefined,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
    };
    const [sales, taxInclusive] = await Promise.all([
      saleRepository.findManyByTenant(filter.tenantId, repoFilter),
      resolveTaxInclusive(filter.tenantId),
    ]);
    return sales.map((sale) => toSaleView(sale, taxInclusive));
  },

  async getById(tenantId: bigint, saleId: bigint, scopedWarehouseId: bigint | null = null): Promise<SaleView> {
    const [sale, taxInclusive] = await Promise.all([
      saleRepository.findByIdForTenant(tenantId, saleId),
      resolveTaxInclusive(tenantId),
    ]);
    if (!sale) {
      throw new AppError("RESOURCE_NOT_FOUND", "Sale not found");
    }
    assertWarehouseAccess({ warehouseId: scopedWarehouseId }, sale.warehouseId);
    return toSaleView(sale, taxInclusive);
  },

  // Used only by modules/webhook/service/order-ingestion.service.ts for
  // its external-reference dedup check (Docs/webhooks.md §4.1) — not
  // exposed via any route.
  async findByWebhookOrigin(
    tenantId: bigint,
    webhookIntegrationId: bigint,
    externalOrderReference: string,
  ): Promise<SaleView | null> {
    const [sale, taxInclusive] = await Promise.all([
      saleRepository.findByWebhookOrigin(tenantId, webhookIntegrationId, externalOrderReference),
      resolveTaxInclusive(tenantId),
    ]);
    return sale ? toSaleView(sale, taxInclusive) : null;
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
    // Tax and charges are computed inside quote() itself now (see
    // promotion.service.ts) — passing extraChargeIds/channel/taxInclusive
    // through means create() reads their result below instead of
    // recomputing them a second time, so the preview and what actually
    // gets persisted can never disagree.
    const quote = await promotionService.quote({
      tenantId: dto.tenantId,
      warehouseId: dto.warehouseId,
      customerId: dto.customerId ?? undefined,
      customerGroupId: customer?.customerGroupId ?? undefined,
      couponCode: dto.couponCode,
      extraChargeIds: dto.extraChargeIds,
      channel: dto.channel,
      taxInclusive: dto.taxInclusive,
      lines: dto.items.map((item, index) => ({
        productId: item.productId,
        categoryId: products.get(item.productId.toString())?.categoryId ?? undefined,
        quantity: item.quantity,
        unitPrice: resolvedPrices[index],
      })),
    });

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
        webhookIntegrationId: dto.webhookIntegrationId,
        externalOrderReference: dto.externalOrderReference,
      });

      const saleItemIdByProductId = new Map<string, bigint>();
      for (const [index, item] of dto.items.entries()) {
        const lineTax = quote.lines[index];
        const createdItem = await saleRepository.createItem(tx, {
          saleId: created.id,
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
      }

      await promotionService.applyQuoteToSale(tx, {
        tenantId: dto.tenantId,
        saleId: created.id,
        customerId: dto.customerId ?? undefined,
        quote,
        saleItemIdByProductId,
      });

      for (const charge of quote.charges) {
        await saleRepository.createCharge(tx, {
          saleId: created.id,
          extraChargeId: BigInt(charge.extraChargeId),
          taxRateId: charge.taxRateId ? BigInt(charge.taxRateId) : null,
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

    // Reuse what quote() already resolved rather than querying
    // TenantSetting again.
    return toSaleView(sale, quote.taxInclusive);
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

    return toSaleView(updated, await resolveTaxInclusive(tenantId));
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
    return toSaleView(
      { ...updated, items: sale.items, discounts: sale.discounts, charges: sale.charges },
      await resolveTaxInclusive(tenantId),
    );
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

  // The assignee must be a real user in this tenant who actually holds
  // SALE.DELIVER — fails loudly rather than silently accepting an
  // assignment nobody can ever act on, same style as role.service.ts's
  // resolvePermissionIds.
  async ship(
    tenantId: bigint,
    saleId: bigint,
    scopedWarehouseId: bigint | null = null,
    assignedDeliveryUserId?: bigint,
  ): Promise<SaleView> {
    let assignee: { id: bigint; name: string } | null = null;
    if (assignedDeliveryUserId !== undefined) {
      const user = await userRepository.findByIdForTenant(tenantId, assignedDeliveryUserId);
      if (!user) {
        throw new AppError("VALIDATION_ERROR", "Assigned delivery user not found");
      }
      const canDeliver = await rbacLookup.roleHasPermission(user.roleId, "SALE.DELIVER");
      if (!canDeliver) {
        throw new AppError("VALIDATION_ERROR", "Assigned user does not hold the SALE.DELIVER permission");
      }
      assignee = { id: user.id, name: user.name };
    }
    return advanceFulfillment(tenantId, saleId, "PACKED", "SHIPPED", scopedWarehouseId, {
      extraData: { assignedDeliveryUserId },
      assignedDeliveryUser: assignee,
    });
  },

  // Only the delivery person this sale was assigned to at ship() time (or
  // a SALE.UPDATE holder, as a manager override) may confirm it — see
  // Docs/business-rules/sales.md. A sale with no assignee (shipped before
  // this feature existed, or via a stale client) falls back to today's
  // rule: any SALE.DELIVER holder, which the route already enforced.
  async deliver(
    tenantId: bigint,
    saleId: bigint,
    scopedWarehouseId: bigint | null = null,
    userId?: bigint,
    roleId?: bigint,
  ): Promise<SaleView> {
    return advanceFulfillment(tenantId, saleId, "SHIPPED", "DELIVERED", scopedWarehouseId, {
      assertAuthorized: async (sale) => {
        if (sale.assignedDeliveryUserId === null) {
          return;
        }
        if (sale.assignedDeliveryUserId === userId) {
          return;
        }
        const canOverride = roleId ? await rbacLookup.roleHasPermission(roleId, "SALE.UPDATE") : false;
        if (!canOverride) {
          throw new AppError("PERMISSION_DENIED", "This sale is assigned to a different delivery person");
        }
      },
    });
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
      return toSaleView(
        { ...updated, items: sale.items, discounts: sale.discounts, charges: sale.charges },
        await resolveTaxInclusive(tenantId),
      );
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

    return toSaleView(updated, await resolveTaxInclusive(tenantId));
  },

  // Populates the assignee picker on ship() — only users who could
  // actually be assigned (i.e. hold SALE.DELIVER), not every user in the
  // tenant.
  async listDeliveryAssignees(tenantId: bigint): Promise<{ id: string; name: string }[]> {
    const users = await userRepository.findManyByTenantWithPermission(tenantId, "SALE.DELIVER");
    return users.map((user) => ({ id: user.id.toString(), name: user.name }));
  },
};

type SaleWithRelations = NonNullable<Awaited<ReturnType<typeof saleRepository.findByIdForTenant>>>;

async function advanceFulfillment(
  tenantId: bigint,
  saleId: bigint,
  requiredStatus: SaleStatus,
  nextStatus: SaleStatus,
  scopedWarehouseId: bigint | null = null,
  options: {
    // Merged into the single status-update write — e.g. ship() also
    // persists assignedDeliveryUserId here, not as a second query.
    extraData?: Prisma.SaleUncheckedUpdateInput;
    // Overrides the assignee shown in the immediate response — needed
    // only when this call just changed it (ship()); every other
    // transition keeps showing the pre-fetched sale.assignedDeliveryUser
    // unchanged, so this stays undefined for them.
    assignedDeliveryUser?: { id: bigint; name: string } | null;
    // Runs right after the sale is loaded, before the transition check —
    // e.g. deliver() uses this to reject a caller who isn't the assigned
    // delivery person (or an override).
    assertAuthorized?: (sale: SaleWithRelations) => void | Promise<void>;
  } = {},
): Promise<SaleView> {
  const sale = await saleRepository.findByIdForTenant(tenantId, saleId);
  if (!sale) {
    throw new AppError("RESOURCE_NOT_FOUND", "Sale not found");
  }
  assertWarehouseAccess({ warehouseId: scopedWarehouseId }, sale.warehouseId);
  if (options.assertAuthorized) {
    await options.assertAuthorized(sale);
  }
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
  const updated = await saleRepository.updateStatus(prisma, saleId, nextStatus, options.extraData);
  return toSaleView(
    {
      ...updated,
      items: sale.items,
      discounts: sale.discounts,
      charges: sale.charges,
      assignedDeliveryUser:
        options.assignedDeliveryUser !== undefined ? options.assignedDeliveryUser : sale.assignedDeliveryUser,
    },
    await resolveTaxInclusive(tenantId),
  );
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
  // An unrestricted charge (no applicableChannels) is effectively mandatory
  // — a platform/bank fee, or a flat shipping charge that always applies —
  // not something a client opts into, so it's included regardless of
  // whether extraChargeIds/channel were passed at all. A channel-restricted
  // charge still only auto-applies when the caller identifies its channel,
  // since applicability genuinely can't be inferred without it. Either way,
  // this is additive to (never replaces) whatever the caller explicitly
  // requested via extraChargeIds — e.g. an optional "Gift wrap" a customer
  // picked still shows up alongside a mandatory shipping charge.
  const autoChargeIds = new Set<string>();
  const activeCharges = (await extraChargeRepository.findManyByTenant(tenantId)) || [];
  for (const c of activeCharges) {
    if (!c.isActive) continue;
    const allowedChannels = c.applicableChannels
      ? c.applicableChannels.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const isUnrestricted = allowedChannels.length === 0;
    const matchesChannel = channel !== undefined && allowedChannels.includes(channel);
    if (isUnrestricted || matchesChannel) {
      autoChargeIds.add(c.id.toString());
    }
  }

  const explicitChargeIds = (extraChargeIds ?? []).map((id) => id.toString());
  const targetChargeIds = [...new Set([...explicitChargeIds, ...autoChargeIds])].map((id) => BigInt(id));

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
    assignedDeliveryUser?: { id: bigint; name: string } | null;
  },
  // No default — every caller must resolve the tenant's actual current
  // setting (resolveTaxInclusive) or reuse an already-resolved TaxContext
  // from create(), rather than silently assuming one. Getting this wrong is
  // exactly what caused sale totals to double-count tax under inclusive
  // pricing (see the comment above totalAmountNum).
  taxInclusive: boolean,
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
  // Tax-inclusive: item.amount/charge.amount already contain their own tax
  // (tax.service.ts's computeLineTax only backs it out internally to split
  // into CGST/SGST/IGST — it never shrinks the stored price/charge amount),
  // so adding totalTaxNum on top here would charge it twice. taxAmount is
  // still reported below for the breakdown; it just isn't part of the total.
  // See Docs/business-rules/taxation.md -> Tax-Inclusive vs. Tax-Exclusive
  // Pricing: "the grand total is unchanged either way."
  const totalAmountNum = taxInclusive
    ? subtotalNum - discountTotalNum + chargesAmountNum
    : subtotalNum - discountTotalNum + totalTaxNum + chargesAmountNum;

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
    externalOrderReference: sale.externalOrderReference ?? null,
    assignedDeliveryUserId: sale.assignedDeliveryUserId?.toString() ?? null,
    assignedDeliveryUserName: sale.assignedDeliveryUser?.name ?? null,
  };
}
