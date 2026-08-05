import { Prisma } from "@prisma/client";
import type { PurchaseReturn, PurchaseReturnItem, PurchaseItem } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { purchaseReturnRepository } from "../repository/purchase-return.repository";
import { inventoryService } from "@/modules/inventory/service/inventory.service";
import { AppError } from "@/shared/errors/app-error";
import { assertWarehouseAccess } from "@/shared/utils/assert-warehouse-access";
import type { CreatePurchaseReturnDto } from "../dto/purchase-return.dto";
import type { PurchaseReturnView } from "../types/purchase-return.types";

type ItemWithReturn = PurchaseReturnItem & { purchaseItem: PurchaseItem };

export const purchaseReturnService = {
  async list(
    tenantId: bigint,
    purchaseId?: bigint,
    scopedWarehouseId: bigint | null = null,
  ): Promise<PurchaseReturnView[]> {
    const returns = await purchaseReturnRepository.findManyByTenant(tenantId, {
      purchaseId,
      warehouseId: scopedWarehouseId,
    });
    return returns.map(toPurchaseReturnView);
  },

  async getById(tenantId: bigint, returnId: bigint): Promise<PurchaseReturnView> {
    const purchaseReturn = await purchaseReturnRepository.findByIdForTenant(tenantId, returnId);
    if (!purchaseReturn) {
      throw new AppError("RESOURCE_NOT_FOUND", "Purchase return not found");
    }
    return toPurchaseReturnView(purchaseReturn);
  },

  // A return only makes sense for goods that were actually received — never
  // for the ordered-but-not-yet-received portion of a line — see
  // Docs/business-rules/purchase-return.md. No status/confirm step: unlike
  // Purchase, a return is recorded as a single atomic event after the
  // physical return already happened. Each line's inventory reversal
  // (PURCHASE_RETURN_OUT) commits atomically with its returnedQuantity
  // update and the PurchaseReturnItem record.
  async create(dto: CreatePurchaseReturnDto): Promise<PurchaseReturnView> {
    const purchase = await purchaseReturnRepository.findPurchaseForTenant(dto.tenantId, dto.purchaseId);
    if (!purchase) {
      throw new AppError("VALIDATION_ERROR", "purchaseId does not belong to this tenant");
    }
    assertWarehouseAccess({ warehouseId: dto.scopedWarehouseId ?? null }, purchase.warehouseId);

    const itemsById = new Map(purchase.items.map((item) => [item.id.toString(), item]));
    for (const returnItem of dto.items) {
      const item = itemsById.get(returnItem.purchaseItemId.toString());
      if (!item) {
        throw new AppError(
          "VALIDATION_ERROR",
          `purchaseItemId ${returnItem.purchaseItemId.toString()} does not belong to this purchase`,
        );
      }
      const remaining = item.receivedQuantity.sub(item.returnedQuantity);
      const returning = new Prisma.Decimal(returnItem.quantity);
      if (returning.greaterThan(remaining)) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Cannot return ${returning.toString()} for product ${item.productId.toString()} — only ${remaining.toString()} received and not yet returned`,
        );
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const purchaseReturn = await purchaseReturnRepository.create(tx, {
        purchaseId: dto.purchaseId,
        reason: dto.reason,
        createdBy: dto.createdBy,
      });

      const items: ItemWithReturn[] = [];
      for (const returnItem of dto.items) {
        const item = itemsById.get(returnItem.purchaseItemId.toString())!;
        const createdItem = await purchaseReturnRepository.createItem(tx, {
          purchaseReturnId: purchaseReturn.id,
          purchaseItemId: item.id,
          quantity: new Prisma.Decimal(returnItem.quantity),
        });

        await purchaseReturnRepository.updateItemReturnedQuantity(
          tx,
          item.id,
          item.returnedQuantity.add(returnItem.quantity),
        );

        await inventoryService.recordMovement(
          {
            tenantId: dto.tenantId,
            warehouseId: purchase.warehouseId,
            productId: item.productId,
            transactionType: "PURCHASE_RETURN_OUT",
            quantityDelta: `-${returnItem.quantity}`,
            referenceType: "PURCHASE_RETURN",
            referenceId: purchaseReturn.id,
            createdBy: dto.createdBy,
          },
          tx,
        );

        items.push({ ...createdItem, purchaseItem: item });
      }

      return { ...purchaseReturn, items };
    });

    return toPurchaseReturnView(created);
  },
};

function toPurchaseReturnView(
  purchaseReturn: PurchaseReturn & { items: ItemWithReturn[] },
): PurchaseReturnView {
  return {
    id: purchaseReturn.id.toString(),
    purchaseId: purchaseReturn.purchaseId.toString(),
    reason: purchaseReturn.reason,
    items: purchaseReturn.items.map((item) => ({
      id: item.id.toString(),
      purchaseItemId: item.purchaseItemId.toString(),
      productId: item.purchaseItem.productId.toString(),
      quantity: item.quantity.toString(),
    })),
    createdAt: purchaseReturn.createdAt.toISOString(),
  };
}
