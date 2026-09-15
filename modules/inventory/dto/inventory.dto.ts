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
  /**
   * Set only when the product tracks batches (Product.trackBatches) — the
   * exact ProductBatch this movement applies to. When set, recordMovement
   * also updates that batch's own quantity by the same delta (kept in
   * lockstep with InventoryBalance) and stamps the ledger row with it. See
   * Docs/batch_expiry_tracking_plan.md §6/§7.
   */
  productBatchId?: bigint;
};

// Creates a ProductBatch if this is its first-ever receipt, or locates the
// existing one for a repeat receipt of the same batch number — see
// Docs/batch_expiry_tracking_plan.md §8. Called from purchase.service.ts's
// receive(), the only place a batch is ever born.
export type EnsureBatchDto = {
  tenantId: bigint;
  warehouseId: bigint;
  productId: bigint;
  batchNumber: string;
  expiryDate?: Date;
  manufacturedDate?: Date;
  costPrice?: string;
};

export type CreateStockAdjustmentDto = {
  tenantId: bigint;
  warehouseId: bigint;
  reason: string;
  items: { productId: bigint; quantityDelta: string; productBatchId?: bigint }[];
  createdBy?: bigint;
  scopedWarehouseId?: bigint | null;
};
