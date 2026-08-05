# Business Rules — Inventory

## Stock Is Never Edited Directly

`InventoryBalance.quantity` is a derived value. No code path may `UPDATE`
it directly outside of `InventoryService` reacting to a new
`InventoryTransaction` row. If a number looks wrong, the fix is a correcting
transaction, not a direct write.

## Negative Stock

Default: selling/transferring more than available stock is rejected
(`INSUFFICIENT_STOCK`, HTTP 422). A tenant-level setting
(`tenant_settings` → `allowNegativeStock`, to be added when the Sales module
is built) may permit backorder-style negative stock — this must be an
explicit opt-in per tenant, never a global default.

## Every Movement Is Traceable

Every change to `InventoryBalance` must be attributable to exactly one
`InventoryTransaction` row via `referenceType` + `referenceId`. A balance
change with no corresponding ledger row is a data integrity bug to be fixed
immediately, not tolerated as a rounding artifact.

## Costing Method

Not yet decided — **must be settled before the Purchase/Sales modules are
built**, since it determines what `purchase_items.price` is used for at sale
time (COGS calculation). Candidates: FIFO, weighted average. Record the
decision as an ADR in `Docs/decisions/` once made — it is a one-way door
once transaction history accumulates under one method.

## Warehouse Transfers

A transfer is two ledger entries (`TRANSFER_OUT` at source, `TRANSFER_IN` at
destination), not one. Both must commit atomically — a transfer that debits
the source but never credits the destination is stock evaporating.

## Multi-Warehouse Aggregation

"Total stock for a product" (across warehouses) is always a query-time sum
over `InventoryBalance`, never a separately maintained aggregate — avoids a
second derived value that can drift from its per-warehouse sources.
