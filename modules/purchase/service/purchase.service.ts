import { Prisma } from "@prisma/client";
import type { Purchase, PurchaseItem, PurchaseItemTax, PurchaseCharge } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { purchaseRepository } from "../repository/purchase.repository";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { taxService } from "@/modules/pricing/service/tax.service";
import type { TaxContext } from "@/modules/pricing/types/tax.types";
import { AppError } from "@/shared/errors/app-error";
import { assertWarehouseAccess } from "@/shared/utils/assert-warehouse-access";
import type {
  CreatePurchaseDto,
  PurchaseListDto,
  ReceivePurchaseDto,
} from "../dto/purchase.dto";
import type { PurchaseView } from "../types/purchase.types";

// Statuses from which a purchase may be received — see
// Docs/business-rules/purchase.md -> Lifecycle. Not DRAFT: an order must be
// placed (confirmed) before goods can arrive against it, and not
// RECEIVED/CANCELLED, which are terminal.
const RECEIVABLE_STATUSES = new Set(["ORDERED", "PARTIALLY_RECEIVED"]);
const CANCELLABLE_STATUSES = new Set(["DRAFT", "ORDERED"]);

export const purchaseService = {
  async list(filter: PurchaseListDto): Promise<PurchaseView[]> {
    const purchases = await purchaseRepository.findManyByTenant(filter.tenantId, {
      status: filter.status as never,
      warehouseId: filter.scopedWarehouseId ?? undefined,
    });
    return purchases.map(toPurchaseView);
  },

  async getById(tenantId: bigint, purchaseId: bigint, scopedWarehouseId: bigint | null = null): Promise<PurchaseView> {
    const purchase = await purchaseRepository.findByIdForTenant(tenantId, purchaseId);
    if (!purchase) {
      throw new AppError("RESOURCE_NOT_FOUND", "Purchase not found");
    }
    assertWarehouseAccess({ warehouseId: scopedWarehouseId }, purchase.warehouseId);
    return toPurchaseView(purchase);
  },

  async create(dto: CreatePurchaseDto): Promise<PurchaseView> {
    assertWarehouseAccess({ warehouseId: dto.scopedWarehouseId ?? null }, dto.warehouseId);

    const supplier = await purchaseRepository.findSupplierForTenant(dto.tenantId, dto.supplierId);
    if (!supplier) {
      throw new AppError("VALIDATION_ERROR", "supplierId does not belong to this tenant");
    }
    const warehouse = await purchaseRepository.findWarehouseForTenant(dto.tenantId, dto.warehouseId);
    if (!warehouse) {
      throw new AppError("VALIDATION_ERROR", "warehouseId does not belong to this tenant");
    }
    for (const item of dto.items) {
      const product = await purchaseRepository.findProductForTenant(dto.tenantId, item.productId);
      if (!product) {
        throw new AppError(
          "VALIDATION_ERROR",
          `productId ${item.productId.toString()} does not belong to this tenant`,
        );
      }
    }

    // Purchases have no pricing/discount engine (see
    // Docs/business-rules/pricing.md) — tax is computed directly on
    // quantity*price, there's no post-discount total to resolve first.
    // Computed before opening the transaction, same reasoning as sales:
    // a missing tax rate or invalid extra charge should fail fast.
    const taxContext = await taxService.resolvePurchaseContext({
      tenantId: dto.tenantId,
      warehouseId: dto.warehouseId,
      supplierId: dto.supplierId,
    });
    const lineTaxResults = await taxService.computeLinesTax(
      dto.tenantId,
      taxContext,
      dto.items.map((item) => ({
        productId: item.productId,
        lineTotal: new Prisma.Decimal(item.quantity).mul(item.price).toString(),
      })),
    );

    const grandTotal = dto.items
      .reduce((sum, item) => sum.add(new Prisma.Decimal(item.quantity).mul(item.price)), new Prisma.Decimal(0))
      .toString();
    const resolvedCharges = await resolvePurchaseCharges(dto.tenantId, taxContext, dto.extraChargeIds, grandTotal);

    const purchase = await prisma.$transaction(async (tx) => {
      const created = await purchaseRepository.create(tx, {
        tenantId: dto.tenantId,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        status: "DRAFT",
        purchaseDate: dto.purchaseDate,
        createdBy: dto.createdBy,
      });

      for (const [index, item] of dto.items.entries()) {
        const lineTax = lineTaxResults[index];
        const createdItem = await purchaseRepository.createItem(tx, {
          purchaseId: created.id,
          productId: item.productId,
          quantity: new Prisma.Decimal(item.quantity),
          price: new Prisma.Decimal(item.price),
          tax: new Prisma.Decimal(lineTax.taxTotal),
        });

        await purchaseRepository.createItemTaxes(
          tx,
          lineTax.components.map((component) => ({
            purchaseItemId: createdItem.id,
            taxRateId: BigInt(lineTax.taxRateId),
            component: component.component,
            ratePercent: new Prisma.Decimal(component.ratePercent),
            amount: new Prisma.Decimal(component.amount),
          })),
        );
      }

      for (const charge of resolvedCharges) {
        await purchaseRepository.createCharge(tx, {
          purchaseId: created.id,
          extraChargeId: charge.extraChargeId,
          taxRateId: charge.taxRateId,
          name: charge.name,
          amount: new Prisma.Decimal(charge.amount),
          taxAmount: new Prisma.Decimal(charge.taxAmount),
        });
      }

      // Read back as one consistent snapshot (items+taxes, charges) rather
      // than hand-assembling the response from partial writes above —
      // still inside the same transaction, so it's atomic with everything
      // just written.
      return purchaseRepository.findByIdTx(tx, created.id);
    });

    return toPurchaseView(purchase);
  },

  async confirm(tenantId: bigint, purchaseId: bigint, scopedWarehouseId: bigint | null = null): Promise<PurchaseView> {
    const purchase = await purchaseRepository.findByIdForTenant(tenantId, purchaseId);
    if (!purchase) {
      throw new AppError("RESOURCE_NOT_FOUND", "Purchase not found");
    }
    assertWarehouseAccess({ warehouseId: scopedWarehouseId }, purchase.warehouseId);
    if (purchase.status !== "DRAFT") {
      throw new AppError("VALIDATION_ERROR", `Only a DRAFT purchase can be confirmed, not ${purchase.status}`);
    }
    const updated = await purchaseRepository.updateStatus(prisma, purchaseId, "ORDERED");
    return toPurchaseView({ ...updated, items: purchase.items, charges: purchase.charges });
  },

  async cancel(tenantId: bigint, purchaseId: bigint, scopedWarehouseId: bigint | null = null): Promise<PurchaseView> {
    const purchase = await purchaseRepository.findByIdForTenant(tenantId, purchaseId);
    if (!purchase) {
      throw new AppError("RESOURCE_NOT_FOUND", "Purchase not found");
    }
    assertWarehouseAccess({ warehouseId: scopedWarehouseId }, purchase.warehouseId);
    if (!CANCELLABLE_STATUSES.has(purchase.status)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Only a DRAFT or ORDERED purchase can be cancelled, not ${purchase.status}`,
      );
    }
    const updated = await purchaseRepository.updateStatus(prisma, purchaseId, "CANCELLED");
    return toPurchaseView({ ...updated, items: purchase.items, charges: purchase.charges });
  },

  // Stock increases only here, never at create/confirm — see
  // Docs/business-rules/purchase.md -> Inventory Impact Timing. Each line's
  // received quantity and the resulting InventoryTransaction/InventoryBalance
  // update commit or roll back together with the purchase's new status, via
  // the same `tx` passed through to inventoryService.recordMovement.
  async receive(dto: ReceivePurchaseDto): Promise<PurchaseView> {
    const purchase = await purchaseRepository.findByIdForTenant(dto.tenantId, dto.purchaseId);
    if (!purchase) {
      throw new AppError("RESOURCE_NOT_FOUND", "Purchase not found");
    }
    assertWarehouseAccess({ warehouseId: dto.scopedWarehouseId ?? null }, purchase.warehouseId);
    if (!RECEIVABLE_STATUSES.has(purchase.status)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Cannot receive a purchase in status ${purchase.status}`,
      );
    }

    const itemsById = new Map(purchase.items.map((item) => [item.id.toString(), item]));
    for (const receiveItem of dto.items) {
      const item = itemsById.get(receiveItem.purchaseItemId.toString());
      if (!item) {
        throw new AppError(
          "VALIDATION_ERROR",
          `purchaseItemId ${receiveItem.purchaseItemId.toString()} does not belong to this purchase`,
        );
      }
      const remaining = item.quantity.sub(item.receivedQuantity);
      const receiving = new Prisma.Decimal(receiveItem.receivedQuantity);
      if (receiving.greaterThan(remaining)) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Cannot receive ${receiving.toString()} for product ${item.productId.toString()} — only ${remaining.toString()} remains`,
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const receiveItem of dto.items) {
        const item = itemsById.get(receiveItem.purchaseItemId.toString())!;
        const newReceivedQuantity = item.receivedQuantity.add(receiveItem.receivedQuantity);

        await purchaseRepository.updateItemReceivedQuantity(tx, item.id, newReceivedQuantity);

        await inventoryService.recordMovement(
          {
            tenantId: dto.tenantId,
            warehouseId: purchase.warehouseId,
            productId: item.productId,
            transactionType: "PURCHASE_IN",
            quantityDelta: receiveItem.receivedQuantity,
            referenceType: "PURCHASE",
            referenceId: purchase.id,
            createdBy: dto.receivedBy,
          },
          tx,
        );
      }

      const allItems = await purchaseRepository.findItemsForPurchase(tx, purchase.id);
      const fullyReceived = allItems.every((item) => item.receivedQuantity.greaterThanOrEqualTo(item.quantity));
      const newPurchase = await purchaseRepository.updateStatus(
        tx,
        purchase.id,
        fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",
      );

      return { ...newPurchase, items: allItems, charges: purchase.charges };
    });

    return toPurchaseView(updated);
  },
};

// Resolves each requested ExtraCharge (flat, or a percentage of the
// pre-tax grand total), and taxes it if the catalog entry is marked
// taxable — computed before the transaction opens, same reasoning as the
// tax-line computation above.
async function resolvePurchaseCharges(
  tenantId: bigint,
  taxContext: TaxContext,
  extraChargeIds: bigint[] | undefined,
  grandTotal: string,
): Promise<
  { extraChargeId: bigint; taxRateId: bigint | null; name: string; amount: string; taxAmount: string }[]
> {
  if (!extraChargeIds || extraChargeIds.length === 0) {
    return [];
  }

  const resolved = [];
  for (const extraChargeId of extraChargeIds) {
    const charge = await purchaseRepository.findExtraChargeForTenant(tenantId, extraChargeId);
    if (!charge) {
      throw new AppError(
        "VALIDATION_ERROR",
        `extraChargeId ${extraChargeId.toString()} does not belong to this tenant`,
      );
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

function toPurchaseView(
  purchase: Purchase & {
    items: (PurchaseItem & { taxes: PurchaseItemTax[] })[];
    charges: PurchaseCharge[];
  },
): PurchaseView {
  return {
    id: purchase.id.toString(),
    supplierId: purchase.supplierId.toString(),
    warehouseId: purchase.warehouseId.toString(),
    status: purchase.status,
    purchaseDate: purchase.purchaseDate.toISOString(),
    items: purchase.items.map((item) => ({
      id: item.id.toString(),
      productId: item.productId.toString(),
      quantity: item.quantity.toString(),
      receivedQuantity: item.receivedQuantity.toString(),
      price: item.price.toString(),
      tax: item.tax.toString(),
      taxes: item.taxes.map((tax) => ({
        taxRateId: tax.taxRateId?.toString() ?? null,
        component: tax.component,
        ratePercent: tax.ratePercent.toString(),
        amount: tax.amount.toString(),
      })),
    })),
    charges: purchase.charges.map((charge) => ({
      id: charge.id.toString(),
      name: charge.name,
      amount: charge.amount.toString(),
      taxAmount: charge.taxAmount.toString(),
    })),
    createdAt: purchase.createdAt.toISOString(),
    updatedAt: purchase.updatedAt.toISOString(),
  };
}
