# Batch & Expiry Tracking — Architecture & Implementation Plan (`batch_expiry_tracking_plan.md`)

This document plans **batch/lot and expiry-date tracking**: capturing a
batch number + expiry date per line when a purchase is received, picking
stock FEFO (first-expiry-first-out) when a sale ships it, carrying batch
identity through transfers/adjustments/returns, and an expiring-batches
report.

Status: **Proposed — not yet implemented.** No code has been written
against this plan; it exists to align on data model and blast radius
before scaffolding anything.

---

## 1. Executive Summary & Why This Is Bigger Than It Looks

Today `InventoryBalance` (`prisma/schema.prisma:1100-1115`) is **one row
per `(warehouse, product)`** — a single quantity, no batch/lot dimension at
all. `InventoryTransaction` (the append-only movement ledger) has no batch
field either. There is currently **zero** batch/expiry concept anywhere in
this codebase (confirmed by grep — no hits beyond unrelated "batched
query"/JWT-"expiry" false positives).

Adding real batch tracking isn't "add two columns to Purchase" — it changes
the *granularity* stock is held at, which every stock-moving flow touches:

- **Purchase receiving** — needs to capture batch number + expiry (and
  split one receive-line across multiple batches if a shipment mixes lots).
- **Sale** (`sale.service.ts:356,407`, confirm/complete) — needs to
  auto-pick *which* batch(es) to sell from (FEFO), not just decrement a
  number.
- **Stock Transfer** (`stock-transfer.service.ts:284,348,415`) — batch
  identity (number + expiry) must travel with the physical stock from the
  source warehouse to the destination.
- **Stock Adjustment** (`inventory.service.ts:182`) — a write-off of
  expired stock needs to target one specific batch, not the aggregate.
- **Purchase Return / Sale Return** (`purchase-return.service.ts:108`,
  `sale-return.service.ts:105`) — need to know which batch(es) a line
  actually came from, to credit the right one back.

Every one of those is an existing `inventoryService.recordMovement(...)`
call site — 9 in total, listed in §6. This plan's central design goal is
making batch tracking **purely additive**: a tenant/product that doesn't
opt in sees zero behavior change, and every existing call site keeps
working unmodified when the product it's moving doesn't track batches.

**Explicitly out of scope**, and called out rather than silently assumed:
batch-level costing (FIFO vs. weighted-average). `Docs/business-rules/
inventory.md:25-31` already flags Costing Method as an unresolved,
one-way-door decision — this plan captures a per-batch `costPrice`
snapshot (cheap, and the natural place to record it) but does **not**
attempt COGS/valuation logic on top of it. See §11.

---

## 2. Core Design Decision: `ProductBatch` Is Additive, Not a Replacement

`InventoryBalance.quantity` for a `(warehouse, product)` stays the
authoritative, fast-read total — exactly as it is today, updated exactly
as it is today. A new `ProductBatch` row is an **additional**, finer-grained
breakdown that only exists for products that opt in, kept in sync with
`InventoryBalance` in the same transaction:

```
InventoryBalance.quantity  ==  SUM(ProductBatch.quantity) for that (warehouse, product)
                                — whenever the product tracks batches.
```

This is the same reasoning `Docs/business-rules/inventory.md`'s "Multi
-Warehouse Aggregation" rule already uses (a stored aggregate must never be
allowed to drift from what it's aggregating) — just applied one level
deeper. Every low-stock alert, dashboard KPI, and POS stock display already
reads `InventoryBalance` and **needs no changes at all**; only the flows
that *create or consume* stock need batch-awareness, and only for products
that opted in.

### Per-product opt-in

`Product.trackBatches Boolean @default(false)` (new column). `false` for
every existing product — completely unaffected. When `true` (and the
tenant's `BATCH_TRACKING` feature is on), purchase receiving requires
batch+expiry input for that product's lines, and sale/transfer/adjustment
movements against it become batch-aware automatically.

---

## 3. System Overview

```
                POST /purchases/{id}/receive
                (batches[] required per line, iff product.trackBatches)
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    inventoryService (extended)                │
│  - ensureAndLockBatch(tx, warehouseId, productId, batchNumber) │
│  - recordMovement(dto, tx)             — unchanged signature,  │
│      + optional productBatchId          batch-aware callers    │
│  - resolveFefoBatches(...)             — sale-side auto-pick   │
└───────────────┬─────────────────────────────┬──────────────────┘
                │                              │
                ▼                              ▼
     InventoryBalance (unchanged)      ProductBatch (new, per warehouse+
     — still the fast aggregate         product+batchNumber; only rows for
       read path, always in sync        batch-tracked products exist)
                │                              │
                └──────────────┬───────────────┘
                               ▼
                  InventoryTransaction.productBatchId (new, nullable)
                  — every movement stays traceable to its batch, same
                    referenceType/referenceId principle as today.
```

---

## 4. Data Model

One new column on `Product`, one new table (`ProductBatch`), one new join
table (`StockTransferItemBatch`), and nullable batch-reference columns on
`InventoryTransaction`, `StockAdjustmentItem`, and `PurchaseReturnItem`. No
change to `InventoryBalance`'s shape.

### 4.1 `Product` addition

```prisma
model Product {
  // ...existing fields...
  trackBatches Boolean @default(false)
}
```

### 4.2 `product_batches` — one row per (warehouse, product, batch number)

| Column | Type | Notes |
|---|---|---|
| `id` | `BigInt` | PK |
| `tenantId` | `BigInt` | FK, cascade |
| `warehouseId` | `BigInt` | FK — batches are warehouse-scoped, same as `InventoryBalance` |
| `productId` | `BigInt` | FK |
| `batchNumber` | `String @db.VarChar(100)` | Supplier/manufacturer lot code, as printed — not generated by this system |
| `expiryDate` | `DateTime?` | Nullable — some batch-tracked products (e.g. serialized electronics) have a lot number but no natural expiry. See §11 open question on whether to force this required |
| `manufacturedDate` | `DateTime?` | Optional, informational only — not used by any business rule in this plan |
| `costPrice` | `Decimal(14,2)?` | Snapshotted from `PurchaseItem.price` at receive time — captured now so a future costing feature has the data already, but **not consumed by any logic in this plan** (see §11) |
| `quantity` | `Decimal(18,4)` | Current on-hand for this exact batch at this warehouse, `@default(0)` |
| `createdAt` / `updatedAt` | `DateTime` | |

```prisma
@@unique([warehouseId, productId, batchNumber])
@@index([tenantId])
@@index([productId, expiryDate])   // expiring-soon report query
@@map("product_batches")
```

A batch's *origin* purchase is discoverable via `InventoryTransaction`
rows of type `PURCHASE_IN` carrying this batch's id — no separate
`PurchaseItemBatch` join table needed, matching "Every Movement Is
Traceable" (`inventory.md`) rather than duplicating that traceability in a
second place.

### 4.3 `InventoryTransaction` addition

```prisma
model InventoryTransaction {
  // ...existing fields...
  productBatchId BigInt?
  productBatch   ProductBatch? @relation(fields: [productBatchId], references: [id], onDelete: SetNull)
}
```
`null` for every movement of a non-batch-tracked product — exactly today's
shape, unchanged.

### 4.4 `StockAdjustmentItem` and `PurchaseReturnItem` additions

Both get one nullable column, not a join table — each is already a single
row per movement, so a batch-tracked line always targets exactly one
batch:

```prisma
model StockAdjustmentItem {
  // ...existing fields...
  productBatchId BigInt?
}
model PurchaseReturnItem {
  // ...existing fields...
  productBatchId BigInt?
}
```

### 4.5 `stock_transfer_item_batches` — join table

A transfer line *can* legitimately split across batches (e.g. shipping 50
units where the source warehouse holds 30 of Batch A and 20 of Batch B) —
this one needs a join table, mirroring how `SaleDiscount`/`CouponRedemption`
already model a one-to-many breakdown elsewhere in this schema:

| Column | Type | Notes |
|---|---|---|
| `id` | `BigInt` | PK |
| `stockTransferItemId` | `BigInt` | FK |
| `productBatchId` | `BigInt` | FK |
| `quantity` | `Decimal(18,4)` | This batch's share of the transfer line |

```prisma
@@index([stockTransferItemId])
@@index([productBatchId])
@@map("stock_transfer_item_batches")
```

### 4.6 `sale_item_batches` — join table

Same shape, for the FEFO auto-pick on a sale line (§7):

| Column | Type | Notes |
|---|---|---|
| `id` | `BigInt` | PK |
| `saleItemId` | `BigInt` | FK |
| `productBatchId` | `BigInt` | FK |
| `quantity` | `Decimal(18,4)` | How much of this line was drawn from this batch |

```prisma
@@index([saleItemId])
@@index([productBatchId])
@@map("sale_item_batches")
```

This is also what makes a **Sale Return** batch-aware without a schema
change on `SaleReturnItem` itself — see §9.

---

## 5. Feature Flag

New `Feature { code: "BATCH_TRACKING", name: "Batch & Expiry Tracking" }`
— confirmed non-colliding against the current catalog
(`prisma/seed.ts`'s `FEATURE_LABELS`). No new permission codes are
strictly needed: batch operations ride on the permission the surrounding
action already requires (`PURCHASE.RECEIVE` to enter batches while
receiving, `INVENTORY.ADJUST` to target a batch in an adjustment,
`STOCK_TRANSFER.SHIP`/`.RECEIVE` for transfers) — `INVENTORY.VIEW` covers
the expiring-batches report.

Gating shape is identical to every other feature-gated module in this
codebase (`withApiAuth({ feature: "BATCH_TRACKING", permission: ... })`,
`hasFeature("BATCH_TRACKING")` client-side) — no new pattern to invent.

---

## 6. Every Existing `recordMovement` Call Site (must all stay working unmodified for non-tracked products)

| # | File:line | Transaction type | Batch-aware in this plan? |
|---|---|---|---|
| 1 | `inventory.service.ts:182` (createStockAdjustment) | `ADJUSTMENT_IN`/`OUT` | Yes — §10 |
| 2 | `stock-transfer.service.ts:284` (ship) | `TRANSFER_OUT` | Yes — §10 |
| 3 | `stock-transfer.service.ts:348` (receive) | `TRANSFER_IN` | Yes — §10 |
| 4 | `stock-transfer.service.ts:415` (cancel) | reversing `TRANSFER_IN` | Yes — mirrors #3 |
| 5 | `purchase.service.ts:237` (receive) | `PURCHASE_IN` | Yes — §8, this is where batches are *born* |
| 6 | `purchase-return.service.ts:108` | `PURCHASE_RETURN_OUT` | Yes — §9 |
| 7 | `sale.service.ts:356` (create, POS/COMPLETED) | `SALE_OUT` | Yes — §7 |
| 8 | `sale.service.ts:407` (confirm) | `SALE_OUT` | Yes — §7 |
| 9 | `sale.service.ts:590` (cancel) | reversing, `SALE_RETURN_IN`-typed | Yes — mirrors return crediting, §9 |
| 10 | `sale-return.service.ts:105` | `SALE_RETURN_IN` | Yes — §9 |
| 11 | `sale-exchange.service.ts:96,152` | (reuses sale/return legs) | Inherited from #7-10, no separate logic |

`inventoryService.recordMovement`'s signature gains one optional field —
`RecordMovementDto.productBatchId?: bigint` — and nothing else changes. A
caller that never passes it (every non-batch-tracked movement) behaves
byte-for-byte as it does today.

---

## 7. Race-Safe Batch Locking

Mirrors `inventory.repository.ts:67-99`'s existing
`ensureAndLockBalance` (`INSERT ... ON DUPLICATE KEY UPDATE`, then
`SELECT ... FOR UPDATE`) for the single-batch case:

```sql
INSERT INTO product_batches (tenantId, warehouseId, productId, batchNumber, expiryDate, quantity, createdAt, updatedAt)
VALUES (?, ?, ?, ?, ?, 0, NOW(), NOW())
ON DUPLICATE KEY UPDATE quantity = quantity
-- then:
SELECT id, quantity FROM product_batches
WHERE warehouseId = ? AND productId = ? AND batchNumber = ?
FOR UPDATE
```

FEFO picking (§8) needs a **multi-row** lock instead — every candidate
batch for a `(warehouse, product)` locked together before the pick
decision is made, so two concurrent sales can't both read the same
pre-lock snapshot and over-sell a soon-to-expire batch:

```sql
SELECT id, batchNumber, expiryDate, quantity FROM product_batches
WHERE warehouseId = ? AND productId = ? AND quantity > 0
ORDER BY expiryDate IS NULL, expiryDate ASC   -- nulls sort last: see §8
FOR UPDATE
```

Both run inside the same Prisma transaction as the balance update and the
`InventoryTransaction` insert — same "insert-then-lock" reasoning
`inventory.repository.ts`'s own comment already documents (a first-ever
movement has no row yet, and `FOR UPDATE` can't lock a row that doesn't
exist).

---

## 8. Purchase Receiving — Where Batches Are Born

### Schema change

`receivePurchaseSchema` (`modules/purchase/schema/purchase.schema.ts:31-32`)
gains an optional per-line `batches` array:

```ts
const receivePurchaseLineSchema = z.object({
  purchaseItemId: idString,
  receivedQuantity: positiveDecimalString,
  // Required (validated in the service, not here — needs the product's
  // trackBatches flag, which the schema layer doesn't have access to) when
  // the line's product tracks batches. Sum of batches[].quantity must
  // equal receivedQuantity.
  batches: z
    .array(z.object({
      batchNumber: z.string().min(1).max(100),
      expiryDate: z.coerce.date().optional(),
      quantity: positiveDecimalString,
    }))
    .optional(),
});
```

Untouched for every product with `trackBatches: false` — `batches` stays
`undefined`, exactly today's `{ purchaseItemId, receivedQuantity }` shape.

### Service change

`purchase.service.ts`'s `receive()` (full method already read — lines
198-264), inside its existing `prisma.$transaction`, per line:

```
if (product.trackBatches) {
  if (!line.batches || sum(line.batches.quantity) !== line.receivedQuantity) {
    throw AppError VALIDATION_ERROR
  }
  for (const batch of line.batches) {
    const locked = ensureAndLockBatch(tx, warehouseId, productId, batch.batchNumber, batch.expiryDate)
    updateBatchQuantity(tx, locked.id, locked.quantity + batch.quantity)
    recordMovement({ ...as today..., productBatchId: locked.id }, tx)  // also updates InventoryBalance, unchanged
  }
} else {
  recordMovement({ ...exactly as today, no productBatchId... }, tx)
}
```

`costPrice` on the created/updated `ProductBatch` is snapshotted from
`PurchaseItem.price` at this same moment — captured, not used yet (§11).

---

## 9. Sale — FEFO Auto-Pick

A sale's payment/pricing flow doesn't change at all; only *inventory
fulfillment* (the `SALE_OUT` movement at create-COMPLETED or confirm) gets
batch-aware, and only for lines whose product tracks batches.

### Algorithm — `resolveFefoBatches`

```
function resolveFefoBatches(tx, tenantId, warehouseId, productId, quantityNeeded):
  candidates = lock every ProductBatch for (warehouseId, productId) with quantity > 0,
               ordered by expiryDate ascending, batches with no expiryDate sorted last
               (a batch with a known expiry is more urgent to sell than one that
               never expires — an unset expiryDate is not "expires soonest")
  remaining = quantityNeeded
  picks = []
  for batch in candidates:
    if remaining <= 0: break
    take = min(batch.quantity, remaining)
    picks.push({ batch, quantity: take })
    remaining -= take
  if remaining > 0:
    throw AppError("INSUFFICIENT_STOCK", ...)  // same code as today's non-batch path
  return picks
```

`sale.service.ts`'s `SALE_OUT` movement loop becomes, for a batch-tracked
product: call `resolveFefoBatches`, then for each pick, call
`recordMovement({ ..., productBatchId: pick.batch.id }, tx)` (decrementing
that exact `ProductBatch.quantity`, and `InventoryBalance.quantity` as it
always has) and insert a `SaleItemBatch` row `{ saleItemId, productBatchId,
quantity: pick.quantity }`. For a non-tracked product, the existing single
`recordMovement` call is unchanged.

This applies identically at `sale.service.ts:356` (POS/COMPLETED) and
`:407` (confirm) — both are "stock actually leaves now" points, same as
today; only *which* code path (single call vs. FEFO loop) differs.

---

## 10. Sale Return / Purchase Return — Crediting the Right Batch

### Sale Return

A `SaleReturnItem` references a `SaleItem`, which (for a batch-tracked
product) now has one or more `SaleItemBatch` rows. A return's returned
`quantity` is prorated across those exact batches in proportion to how the
original sale drew from them — same proration *shape* as
`sale-return.md`'s existing discount proration and `credit_module_plan.md`
§9's credit-note proration, applied a third time to the same kind of
problem:

```
saleItemBatches = SaleItemBatch rows for this SaleItem, e.g. [{batchA, 6}, {batchB, 4}]
saleItemTotalQuantity = 10
returnQuantity = 3
for each (batch, batchQty) in saleItemBatches:
  share = returnQuantity * (batchQty / saleItemTotalQuantity)  // e.g. batchA: 1.8, batchB: 1.2
  recordMovement({ transactionType: "SALE_RETURN_IN", productBatchId: batch.id, quantityDelta: share }, tx)
```

Rounding is handled the same way `sale-return.service.ts`'s existing
per-line math already does (`Prisma.Decimal`, no manual rounding beyond
what the column's own precision enforces) — not a new concern this plan
introduces.

### Purchase Return

Simpler: a `PurchaseReturnItem` is already one row referencing one
`PurchaseItem`; the create-return input gains an optional
`productBatchId` (which batch is physically going back to the supplier),
required when the product tracks batches, validated against that
warehouse's actual batches for the product the same way every other
cross-entity id is validated elsewhere in this codebase (`findXForTenant`
-style repository check).

### Sale cancel() (`sale.service.ts:590`)

Reverses a `SALE_OUT` the same way a `SaleReturn` credits one — replays
each sale item's `SaleItemBatch` rows 1:1 (a cancellation reverses the
*entire* line, no proration needed, unlike a partial return).

---

## 11. Explicitly Deferred

1. **Batch-level costing (FIFO / weighted-average).** `costPrice` is
   captured on `ProductBatch` at receive time (§8) because it's free to
   record and it's the natural moment to snapshot it — but no COGS,
   margin, or valuation calculation in this plan reads it.
   `Docs/business-rules/inventory.md:25-31` already flags the
   FIFO-vs-weighted-average choice as unresolved; this plan doesn't
   resolve it, only avoids making it harder to resolve later.
2. **Expiry-alert notifications.** The report in §12 is pull (a page
   someone visits), not push. Wiring a scheduled job into the existing
   Notification system (`Docs/notification_plan.md`) to proactively alert
   on soon-to-expire batches is a natural follow-up, not included here —
   same "flagged, not built" treatment the credit module gave settlement
   -date reminders.
3. **Serial-number-level tracking** (one row per physical unit, vs. one
   row per batch/lot covering many units) — a materially different, much
   heavier model. Nothing here precludes adding it later for specific
   products, but it's a different feature.

---

## 12. UI / Feature-Gating Surface

Every one of these checks `hasFeature("BATCH_TRACKING")`, same convention
as every other feature-gated screen in this app:

- **Product create/edit form** — a `trackBatches` checkbox, visible only
  when the feature is on.
- **Purchase receiving form** — when a line's product has `trackBatches`,
  the quantity field is replaced by a repeatable batch-number/expiry-date
  /quantity sub-form (add-another-batch), with a running "X of Y received
  quantity allocated" check before submit — mirrors this app's existing
  pattern of client-side pre-checks backed by an authoritative server
  -side re-validation.
- **New "Expiring Batches" report page** (`/inventory/batches`) — every
  `ProductBatch` with `quantity > 0`, sortable by days-until-expiry,
  filterable by warehouse/product, a visual flag (e.g. destructive badge)
  under a configurable threshold. Read-only, `INVENTORY.VIEW`.
- **Stock Adjustment form** — when adjusting a batch-tracked product, a
  batch picker appears (defaults to "oldest expiry first," same FEFO bias
  as sales, since a write-off is most often clearing expired/near-expired
  stock).
- **Stock Transfer ship form** — batch picker (or FEFO-auto, mirroring
  sales) when the product being shipped tracks batches.
- **POS checkout** — deliberately **no new UI**. FEFO picking is fully
  automatic server-side; a cashier selling a batch-tracked product sees no
  difference from selling any other product. (Which batch(es) fulfilled a
  sale is visible after the fact on the sale's detail view, if that view
  is extended to show it — a small, optional addition, not required for
  this plan's core value.)

---

## 13. Open Questions

1. **Is `expiryDate` required whenever `trackBatches` is true, or
   optional per-batch?** This plan models it as optional on `ProductBatch`
   (§4.2) so a lot-tracked-but-non-perishable product (e.g. serialized
   electronics) still fits the same model — but the feature is literally
   named "batch & expiry tracking," so confirm whether every batch of a
   tracked product should be required to carry one.
2. **FEFO for everyone, or configurable FIFO/FEFO per tenant or per
   product?** This plan hard-codes FEFO (expiry-soonest-first) since
   that's the standard pattern for perishable/regulated goods and matches
   the feature's stated purpose — confirm that's actually always wanted,
   vs. some tenants wanting plain FIFO (oldest-received-first) regardless
   of expiry.
3. **Can a batch go negative / oversell relative to itself** the way a
   product's aggregate balance can be tenant-configured to allow
   (`inventory.md`'s planned negative-stock override)? This plan assumes
   no — `resolveFefoBatches` hard-stops at `INSUFFICIENT_STOCK` once every
   batch is exhausted, same as today's aggregate-level check.
4. **Should an already-expired batch still be sellable at all** (e.g. for
   a tenant that wants to flag but not hard-block expired stock), or
   should `resolveFefoBatches` refuse to pick from a batch whose
   `expiryDate` has passed? This plan is silent on that — currently
   FEFO order alone doesn't prevent selling expired stock, it just
   deprioritizes it least (soonest-expiring, including already-expired,
   is picked *first*). Confirm whether a hard block is wanted.
5. **Batch number uniqueness scope** — this plan scopes
   `@@unique([warehouseId, productId, batchNumber])`, so the same physical
   lot received into two different warehouses becomes two independent
   `ProductBatch` rows (correct, since stock is warehouse-scoped) but the
   *same* batch number could coincidentally collide across two unrelated
   products at the same warehouse without erroring (different
   `productId`, so the unique constraint doesn't fire) — confirm that's
   fine (it should be; a supplier's lot code isn't globally unique across
   every product they ship).

---

## 14. Phased Delivery

1. **Schema**: `Product.trackBatches`, `product_batches`,
   `stock_transfer_item_batches`, `sale_item_batches`,
   `InventoryTransaction.productBatchId`,
   `StockAdjustmentItem.productBatchId`,
   `PurchaseReturnItem.productBatchId` — migration, seed the
   `BATCH_TRACKING` `Feature` row.
2. **Inventory core**: `ensureAndLockBatch`, `recordMovement`'s
   `productBatchId` field (§6/§7) — every existing call site continues to
   compile and behave identically with the field omitted.
3. **Purchase receiving** (§8) — the first real batch-creating flow;
   ships alone as a usable (if inert) feature: batches get recorded even
   before anything consumes them.
4. **Sale FEFO** (§9) — `resolveFefoBatches`, wired into
   `sale.service.ts:356,407`.
5. **Returns & cancellation** (§10) — sale return/cancel batch crediting,
   purchase return batch selection.
6. **Transfers & adjustments** (§10 note, §12) — batch-aware ship/receive,
   batch-targeted stock adjustments.
7. **Frontend** (§12): Product form toggle, Purchase receive batch
   sub-form, Expiring Batches report, Adjustment/Transfer batch pickers —
   all behind `hasFeature("BATCH_TRACKING")`.
8. **Tests**: `resolveFefoBatches` (pick order, exact-exhaustion,
   insufficient-stock, null-expiry-sorts-last), purchase-receive batch
   split validation, sale-return proration across multiple batches,
   tenant-isolation on every new repository method — same coverage bar
   the credit module's `credit.service.test.ts` set.
9. **Follow-up** (§11, not in this pass unless confirmed in-scope now):
   batch-level costing/valuation, expiry-alert notifications.
