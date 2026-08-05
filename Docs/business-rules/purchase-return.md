# Business Rules — Purchase Return

## Can Only Return What Was Received

The returnable quantity for a `PurchaseItem` is
`receivedQuantity − returnedQuantity`, **not** `quantity − returnedQuantity`.
An order line that was ordered but never received has nothing to return —
returning is reversing a physical receipt, not cancelling an order (use
`Purchase.cancel` for that, see `purchase.md`).

## No Status, No Confirm Step

Unlike `Purchase` itself, `PurchaseReturn` has no lifecycle — creating one
*is* processing it. The physical return already happened by the time
someone records it; there's no draft state to sit in beforehand.

## Inventory Impact Is Immediate

Creating a `PurchaseReturn` writes a `PURCHASE_RETURN_OUT` ledger entry (and
decrements `InventoryBalance`) for each returned line, in the same
transaction as the `PurchaseReturnItem` record and the
`PurchaseItem.returnedQuantity` update. All or nothing — a return recorded
with no matching stock decrease is a data integrity bug.

## Cumulative Across Multiple Returns

A single purchase item can be returned across more than one
`PurchaseReturn` (e.g. discovering more damaged units later) — the
remaining-returnable check always uses the running `returnedQuantity`, not
just the current request's own items.
