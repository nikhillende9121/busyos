# Business Rules — Purchase

## Lifecycle

```text
DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED
                              ↘ CANCELLED (only from DRAFT or ORDERED)
```

## Inventory Impact Timing

Stock increases only on **receiving**, not on order creation. A `DRAFT` or
`ORDERED` purchase must not affect `InventoryBalance` — otherwise stock
counts include goods that haven't physically arrived. Receiving a partial
shipment generates `PURCHASE_IN` ledger entries only for the quantities
actually received, and moves the purchase to `PARTIALLY_RECEIVED`.

## Cancellation

A purchase can only be cancelled from `DRAFT` or `ORDERED` — once any items
have been received (`PARTIALLY_RECEIVED` or `RECEIVED`), it cannot be
cancelled; use a `PurchaseReturn` instead so the reversal is itself a
traceable ledger event.

## Purchase Returns

A `PurchaseReturn` generates its own outbound inventory ledger entry — it
does not delete or edit the original `PurchaseItem`/`InventoryTransaction`
rows. Original purchase history must remain intact for audit purposes.

## Tax and Pricing

`PurchaseItem.price` is the negotiated cost price per unit, `tax` is
computed per the tenant's configured tax rate at the time of purchase (not
recalculated retroactively if the tax rate later changes — historical
purchases keep the tax rate that applied when they were created).
