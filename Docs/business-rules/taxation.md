# Business Rules — Taxation (GST) & Extra Charges

## Status

Implemented end-to-end: schema (`TaxRate`, `ExtraCharge`, `SaleItemTax`,
`PurchaseItemTax`, `SaleCharge`, `PurchaseCharge`), the calculation engine
(`modules/pricing/service/tax.service.ts`), and integration into both
`modules/sales` and `modules/purchase` at creation time. Builds on top of
`pricing.md`'s price-resolution design and `discounts-and-coupons.md`'s
order of operations — read those first.

Known gaps, flagged not silent: no GSTR-1/3B export or direct government
portal filing (`/reports/gst` is an internal report, not a filing tool),
no e-invoicing/e-way bill generation, no reverse charge / composition
scheme / TCS-TDS handling, no per-warehouse separate GSTIN numbers (one
tenant-wide GSTIN plus per-warehouse `state` only drives the CGST/SGST/IGST
split, not full multi-registration compliance), no HSN-rate auto-lookup
against a government master list (tenant enters `TaxRate` rows manually).

## TaxRate — a Tenant-Defined Catalog, Not Hardcoded Slabs

```text
TaxRate
  tenantId, name
  hsnCode?, sacCode?
  ratePercent     Decimal(5,2)
  cessPercent     Decimal(5,2)  @default(0)
  isActive
```

No GST slab (0%/5%/12%/18%/28%) is hardcoded anywhere — a tenant creates
its own `TaxRate` rows (`/tax-rates`) with whatever HSN/SAC code and
percentage applies to its own goods/services. `cessPercent` is a separate
optional levy (luxury/sin goods) computed independently of the
CGST/SGST/IGST split — see Compensation Cess, below.

A `TaxRate` is soft-deleted, never hard-deleted, and blocked from deletion
while any `Product.taxRateId` still points at it (`CONFLICT`) — a rate
referenced by `SaleItemTax`/`PurchaseItemTax` rows must survive for those
historical rows to remain meaningful.

## Rate Resolution: Product → Tenant Default → Error

Each line resolves its tax rate as `Product.taxRateId ?? TenantSetting.
defaultTaxRateId`. If neither is set, tax computation fails outright
(`VALIDATION_ERROR`) — there is no silent 0% tax. A tenant that hasn't
configured taxation yet simply cannot create a sale/purchase until it
does, by design.

## The CGST+SGST vs. IGST Split

The actual legal mechanic of Indian GST, not a simplification: the same
`ratePercent` splits into two half-rate components (CGST + SGST) when
buyer and seller are in the same state, or applies once in full as IGST
when they differ.

- **Sales**: seller = `Warehouse.state` (falls back to `TenantSetting.
  homeState` if the warehouse has none set); buyer = `Customer.state`.
- **Purchases**: roles reverse — seller = `Supplier.state`; buyer =
  the receiving `Warehouse.state` (same `homeState` fallback). This is
  what makes the purchase side an **input tax credit** question rather
  than an output-tax one — see Output vs. Input Tax, below.

If either side's state is unset, the split defaults to **intra-state**
(CGST+SGST) rather than erroring — an unconfigured tenant shouldn't be
blocked from transacting at all, but should configure
`Warehouse.state`/`Customer.state`/`Supplier.state`/`TenantSetting.
homeState` for the split to be correct. State comparison is
case/whitespace-insensitive string equality; there is no fixed enum in
the schema (same philosophy as `TenantSetting.currency`) — the UI
constrains input to a fixed Indian states/UTs list
(`lib/constants/indian-states.ts`).

## Compensation Cess

If a `TaxRate.cessPercent` is non-zero, a separate `CESS` component row is
added on top of the CGST+SGST/IGST split, computed against the same
taxable value — cess is a single national levy, never itself split by
state the way CGST/SGST/IGST are.

## Tax-Inclusive vs. Tax-Exclusive Pricing

`TenantSetting.taxInclusivePricing` (boolean, tenant-wide) resolves what
`pricing.md`'s "Open Decisions" section had left unresolved:

- **`false` (exclusive, the default)**: tax is computed on top of the
  post-discount line total; the customer pays taxable value + tax.
- **`true` (inclusive)**: the post-discount line total already contains
  tax — it's backed out as `amount / (1 + combinedRatePercent/100)` before
  computing each component. The **grand total is unchanged** either way;
  only the taxable-value/tax split differs.

## Order of Operations

Extends `discounts-and-coupons.md`'s sequence — tax was previously a stub
comment at step 4, now the actual computation:

```text
1. Resolve base price per line item          (pricing.md)
2. Apply automatic Discounts                 (discounts-and-coupons.md)
3. Apply at most one Coupon                  (discounts-and-coupons.md)
4. Compute tax on the resulting line total    (this document)
```

Purchases skip steps 2–3 entirely — they have no pricing/discount engine
(`discounts-and-coupons.md` → Returns) — so tax is computed directly on
`quantity * price`.

## Persistence: Full Breakdown, Not a Flat Number

`SaleItem.tax`/`PurchaseItem.tax` remain the pre-computed line total (sum
of that line's tax rows), unchanged in shape from before — existing code
reading `.tax` doesn't break. What's new is `SaleItemTax`/`PurchaseItemTax`,
one row per applicable component (2 for intra-state, 1 for inter-state,
+1 more if cess applies), each snapshotting `taxRateId`, `component`
(`CGST`/`SGST`/`IGST`/`CESS`), and the exact `ratePercent`/`amount` used —
**never recomputed later from the live `TaxRate` definition**, which may
since have changed or been deleted, same auditability principle
`SaleDiscount` already follows (`discounts-and-coupons.md` → Auditability).

## Extra Charges — a Separate Catalog, Deliberately Not Tax

```text
ExtraCharge
  tenantId, name
  calcType     FLAT | PERCENTAGE
  value        Decimal
  isTaxable    Boolean  @default(false)
  taxRateId?   (required if isTaxable)
  isActive
```

Shipping, packing, and handling are invoice-level charges, not tax —
modeled as their own catalog so a tenant can define them once and attach
zero or more to a specific sale/purchase (`extraChargeIds` on create).
`FLAT` charges use `value` as-is; `PERCENTAGE` charges compute `value`%
of the pre-tax grand total. A charge marked `isTaxable` runs through the
exact same rate-resolution/split logic as a product line, using its own
`taxRateId` — persisted as `SaleCharge`/`PurchaseCharge` (`name`, `amount`,
`taxAmount`), snapshotting the catalog entry's name/amount at attach time
so a later-retired `ExtraCharge` (its `extraChargeId` goes `SetNull`)
doesn't corrupt past invoices.

## Output vs. Input Tax (GSTR-1 / Net Payable)

`/reports/gst` (`lib/insights/compute-gst-insights.ts`) treats sales as
**output tax** (collected from customers) and purchases as **input tax**
(paid to suppliers — input tax credit), for a given date range:

```text
netPayable = outputTax - inputTax
```

The report's HSN/rate-wise summary is output-tax only (grouped by the
actual `TaxRate`/HSN, not just by percentage, since two different HSN
codes can share the same rate) — the exact section GSTR-1's HSN summary
needs. Taxable value per rate bucket is recovered as `taxTotal / (combinedRatePercent
/ 100)` per line, since taxable value itself isn't a persisted column —
only the resulting component amounts are.
