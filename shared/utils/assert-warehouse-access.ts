import { AppError } from "@/shared/errors/app-error";

// Deliberately just the one field, not the full AuthContext — services
// only ever need to thread `auth.warehouseId` (a scalar) through their own
// signatures (e.g. `list(tenantId, scopedWarehouseId)`), not the whole
// auth object, to reach this check.
type WarehouseScope = { warehouseId: bigint | null };

// A warehouse-scoped user (see prisma/schema.prisma's User.warehouseId,
// Docs/business-rules/roles-and-permissions.md -> Warehouse-Scoped Users)
// may only act on their own store. `warehouseId === null` means
// unrestricted — most tenant-admin-style users never trip this check at
// all. One error code for every scope violation, rather than switching
// between PERMISSION_DENIED/RESOURCE_NOT_FOUND per call site.
export function assertWarehouseAccess(scope: WarehouseScope, warehouseId: bigint): void {
  if (scope.warehouseId !== null && scope.warehouseId !== warehouseId) {
    throw new AppError("PERMISSION_DENIED", "This account is restricted to a single warehouse");
  }
}

// For operations spanning two warehouses (a stock transfer's from/to) — a
// scoped user may move stock in or out of their own store, so either side
// matching is sufficient; requiring both would make transfers impossible
// for them.
export function assertWarehouseAccessAny(scope: WarehouseScope, warehouseIds: bigint[]): void {
  if (scope.warehouseId !== null && !warehouseIds.includes(scope.warehouseId)) {
    throw new AppError("PERMISSION_DENIED", "This account is restricted to a single warehouse");
  }
}
