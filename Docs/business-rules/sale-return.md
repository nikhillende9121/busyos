# Business Rules — Sale Return

## Only Returnable Once Stock Actually Left

A `SaleReturn` is only valid against a sale in `CONFIRMED` or `COMPLETED`
status — those are the only states where stock was actually decremented
(see `sales.md` → Inventory Impact Timing). `DRAFT`/`PENDING_PAYMENT` sales
never touched inventory, and a `CANCELLED` sale already reversed whatever it
took — there's nothing left to hand back in either case.

## Returnable Quantity

Unlike purchases (which track `receivedQuantity` separately from ordered
`quantity`), a `SaleItem`'s full `quantity` is decremented in one step at
confirmation — so the returnable amount is simply
`quantity − returnedQuantity`.

## No Status, No Confirm Step

Same as `PurchaseReturn`: creating a `SaleReturn` *is* processing it. No
draft state — the customer already physically returned the goods by the
time this gets recorded.

## Inventory Impact Is Immediate

Creating a `SaleReturn` writes a `SALE_RETURN_IN` ledger entry (crediting
`InventoryBalance` back) for each returned line, atomically with the
`SaleReturnItem` record and the `SaleItem.returnedQuantity` update.

## Distinct From Cancellation's Reversal

Cancelling a `CONFIRMED` sale (see `sales.md` → Cancellation) also credits
stock back via a `SALE_RETURN_IN`-typed movement, but records it against
`referenceType: SALE` (the sale itself). A genuine `SaleReturn` uses
`referenceType: SALE_RETURN` with the return record's own id — the two are
distinguishable in the ledger even though they share a transaction type.

## Discount-Aware Refunds

`SaleReturnItem.refundAmount` is prorated from what the line *actually
charged* after discounts, never the undiscounted list price — otherwise a
return on a discounted sale would refund more than the customer paid.
Computed per return, from the sale's own recorded `SaleDiscount` rows (see
`discounts-and-coupons.md` → Auditability), not from the live `Discount`/
`Coupon` definitions, which may have changed since:

```text
lineLevelDiscount    = sum of SaleDiscount.amount where saleItemId = this line
orderLevelDiscount   = sum of SaleDiscount.amount where saleItemId is null
proratedOrderDiscount = orderLevelDiscount × (thisLineSubtotal / saleSubtotal)
effectiveLineTotal    = lineSubtotal − lineLevelDiscount − proratedOrderDiscount
refundAmount          = (effectiveLineTotal / lineQuantity) × returnedQuantity
```

An order-level reduction (an `ORDER`-scope coupon, recorded with
`saleItemId = null`) was never attributed to one specific line, so it's
apportioned across every line by that line's share of the sale's total
subtotal — there's no more precise attribution available. A `PRODUCT`/
`CATEGORY`-scoped coupon's reduction, by contrast, is already recorded
per-line (`saleItemId` set), so it's picked up directly as a line-level
discount, not apportioned.

Effective line total is clamped at zero before dividing — a line whose
discounts summed to more than its subtotal (shouldn't happen given the
discount engine's own per-line caps, but defended against here too) refunds
nothing further rather than computing a negative unit price.
