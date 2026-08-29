import type { InventoryTransactionType, ReferenceType } from "@prisma/client";

export type BalanceFilterDto = {
  tenantId: bigint;
  warehouseId?: bigint;
  productId?: bigint;
  // Matches the product's name, SKU, or barcode — see
  // modules/inventory/repository/inventory.repository.ts.
  search?: string;
  page: number;
  pageSize: number;
  scopedWarehouseId?: bigint | null;
};

export type BalanceExportDto = {
  tenantId: bigint;
  warehouseId?: bigint;
  productId?: bigint;
  search?: string;
  scopedWarehouseId?: bigint | null;
};

// The reusable movement primitive's input — see
// modules/inventory/service/inventory.service.ts -> recordMovement.
// quantityDelta is a signed decimal string: positive increases the
// balance, negative decreases it. Callers MUST have already verified
// warehouseId and productId belong to tenantId; recordMovement trusts its
// caller the same way a repository trusts its service.
export type RecordMovementDto = {
  tenantId: bigint;
  warehouseId: bigint;
  productId: bigint;
  transactionType: InventoryTransactionType;
  quantityDelta: string;
  referenceType: ReferenceType;
  referenceId: bigint;
  createdBy?: bigint;
  /** Permit the movement to take the balance below zero. Default false — see Docs/business-rules/inventory.md -> Negative Stock. */
  allowNegative?: boolean;
};

export type CreateStockAdjustmentDto = {
  tenantId: bigint;
  warehouseId: bigint;
  reason: string;
  items: { productId: bigint; quantityDelta: string }[];
  createdBy?: bigint;
  scopedWarehouseId?: bigint | null;
};
