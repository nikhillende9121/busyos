# Credit Payment Module — Architecture & Implementation Plan (`credit_module_plan.md`)

This document plans a configurable **Credit Payment Module**: a customer-wise
credit ledger (opening balance, sale-time charges, cash settlements), a
per-customer/per-tenant credit limit, a customer-wise credit report with
drill-down transaction history, and end-to-end feature-flag gating so the
entire module can be switched off per tenant.

Status: **Proposed — not yet implemented.** No code has been written against
this plan; it exists to align on data model and API shape before scaffolding
`modules/credit/`.

---

## 1. Executive Summary & Goals

Retail/distribution customers often buy on account and settle periodically
(weekly/monthly) rather than paying in full at the till. Today `PaymentMethod`
already lists `CREDIT` as an enum value (`prisma/schema.prisma:185-192`), but
nothing tracks *how much* a customer owes, *when* it's due, or *whether*
they've hit a limit — a credit sale today is indistinguishable from any other
`Payment` row. This module adds the missing ledger and controls:

- Record an existing/opening due amount per customer (onboarding a customer
  who already owed money before this system existed).
- Set a monthly settlement/due date per customer for reminders.
- Record cash (or any method) payments against outstanding credit.
- Maintain a full, append-only credit transaction history with a running
  balance.
- Provide a customer-wise Credit Report (total credit extended, payments
  received, pending balance, due date) that drills into that customer's
  transaction history.
- Enforce a **maximum credit limit**, configurable both per-customer and as a
  tenant-wide default, blocking new credit charges that would exceed it.
- Gate all of the above behind a feature flag (`CREDIT_PAYMENT`) so a tenant
  whose plan doesn't include it sees no credit UI, fields, or validations —
  and existing payment methods/workflows are untouched.
- **Keep the due amount correct at every point it can change**: a credit sale
  increases it, a manual payment decreases it, and — new in this revision —
  a **sale return / credit note issued against a credit-paid sale** decreases
  it too. See §9.
- **POS must show the customer's current due and max limit at the moment
  Credit is selected as the payment method**, not just in the back-office
  report. See §10.

### Note on "Method of Payment: `0`"

The codebase's `PaymentMethod` is a **string-based Prisma enum**
(`CASH | CARD | BANK_TRANSFER | UPI | CHEQUE | CREDIT`), not a numeric code
table, and `CREDIT` **already exists** as a value (`prisma/schema.prisma:191`,
also mirrored in Zod as a string enum in
`modules/sales/schema/sale-exchange.schema.ts:30`). There is no numeric `0`/`1`
payment-method scheme anywhere in this repo. If "`0`" refers to an external
system's ordinal (e.g. an Android POS terminal or a legacy spec), that mapping
should be confirmed and, if needed, handled at the API boundary (translating
an incoming numeric code to the `PaymentMethod` string) rather than by
renumbering the internal enum. **This plan does not change `PaymentMethod`** —
the actual net-new work is everything `CREDIT` currently has no support for:
limits, ledger, reminders, and reporting.

---

## 2. System Overview

```
                     ┌─────────────────────────────┐
                     │   POS / Sale Checkout        │
                     │  (paymentMethod = CREDIT)     │
                     └───────────────┬──────────────┘
                                     │ 1. check feature + limit (same DB tx)
                                     ▼
┌───────────────────────────────────────────────────────────────┐
│                     modules/credit/service                     │
│  - validateCreditLimit(tenantId, customerId, amount)            │
│  - recordCharge(...)      (sale-time, called from sale.service) │
│  - recordPayment(...)     (manual cash/UPI/etc. settlement)     │
│  - getCustomerLedger(...) / getCreditReport(...)                │
└───────────────┬─────────────────────────────┬──────────────────┘
                │                              │
                ▼                              ▼
     CustomerCredit (1 row/customer)   CreditTransaction (append-only ledger)
                │                              │
                └──────────────┬───────────────┘
                               ▼
                  TenantSetting.defaultCreditLimit
                  (tenant-wide fallback cap)
```

Enforcement is server-side only (same rule as every other feature-gated
module — see `lib/nav/sections.ts:1-13`): the nav item and UI fields are a
convenience; `withApiAuth`'s `feature: "CREDIT_PAYMENT"` option is the actual
boundary, plus an in-service check where `CREDIT` is only one payment option
among several on the shared sale-creation route.

---

## 3. Data Model

Two new tables plus one new `TenantSetting` column. No changes to
`PaymentMethod`, `Payment`, or `Sale`.

### 3.1 `customer_credits` — one row per customer with credit ever configured

| Column | Type | Notes |
|---|---|---|
| `id` | `BigInt` | PK |
| `tenantId` | `BigInt` | FK `tenants.id`, cascade |
| `customerId` | `BigInt` | FK `customers.id`, cascade; **unique with `tenantId`** |
| `creditLimit` | `Decimal(14,2)?` | Per-customer override. `null` = fall back to `TenantSetting.defaultCreditLimit`; both `null` = unlimited (mirrors `Plan.maxWarehouses`-style null-is-unlimited convention, `prisma/schema.prisma:270`) |
| `settlementDay` | `Int?` | Day-of-month (1–28) for the monthly due-date reminder; `null` = no recurring reminder |
| `currentBalance` | `Decimal(14,2)` | Denormalized running balance, `@default(0)`. Always equal to the sum of `CreditTransaction` deltas for this customer — kept as a column (not computed per-request) the same way `TenantSetting` keeps scalar config off the hot path, and because the limit check needs it cheaply on every credit sale |
| `createdAt` / `updatedAt` | `DateTime` | |

```
@@unique([tenantId, customerId])
@@index([tenantId])
@@map("customer_credits")
```

### 3.2 `credit_transactions` — append-only ledger, one row per movement

| Column | Type | Notes |
|---|---|---|
| `id` | `BigInt` | PK |
| `tenantId` | `BigInt` | FK, cascade |
| `customerId` | `BigInt` | FK `customers.id` |
| `type` | `CreditTransactionType` | `OPENING \| SALE_CHARGE \| PAYMENT \| CREDIT_NOTE \| ADJUSTMENT` |
| `direction` | `CreditDirection` | `OUT` (increases what the customer owes: opening balance, sale charge) or `IN` (decreases it: a payment or a credit note). Kept explicit rather than inferring sign from `type`, so a future `ADJUSTMENT` can go either way |
| `amount` | `Decimal(14,2)` | Always positive; `direction` carries the sign |
| `runningBalance` | `Decimal(14,2)` | Snapshot of `CustomerCredit.currentBalance` immediately after this row — makes ledger history renderable without recomputation, and gives an audit trail if the denormalized column ever drifts |
| `paymentMethod` | `PaymentMethod?` | Set only for `PAYMENT` rows (e.g. `CASH`, `UPI`, `BANK_TRANSFER`) — how the customer actually settled. `null` for `CREDIT_NOTE` rows (nothing changed hands, the due amount was simply reduced) |
| `referenceType` | `CreditReferenceType?` | `SALE \| SALE_RETURN \| MANUAL`; `null` for `OPENING` |
| `referenceId` | `BigInt?` | `Sale.id` when `referenceType = SALE`; `SaleReturn.id` when `referenceType = SALE_RETURN` |
| `remarks` | `String? @db.VarChar(255)` | Free-text reference/remarks field from the requirements |
| `createdAt` | `DateTime` | |
| `createdBy` | `BigInt?` | `User.id`, who recorded it |

```
@@index([tenantId, customerId, createdAt])
@@index([referenceType, referenceId])
@@map("credit_transactions")
```

New enums:

```prisma
enum CreditTransactionType {
  OPENING       // one-time, existing due amount recorded at onboarding
  SALE_CHARGE   // a sale paid (in full or part) with CREDIT
  PAYMENT       // a manual cash/UPI/etc. settlement against the due amount
  CREDIT_NOTE   // an automatic reduction from a SaleReturn against a credit-paid sale
  ADJUSTMENT    // manual correction, either direction (see §9's open question)
}

enum CreditDirection {
  IN   // reduces what the customer owes: PAYMENT, CREDIT_NOTE
  OUT  // increases what the customer owes: OPENING, SALE_CHARGE
}

enum CreditReferenceType {
  SALE          // SALE_CHARGE rows
  SALE_RETURN   // CREDIT_NOTE rows
  MANUAL        // PAYMENT / ADJUSTMENT rows
}
```

### 3.3 `TenantSetting` addition

Following the existing scalar-config precedent (`decimalPrecision`,
`taxInclusivePricing` — `prisma/schema.prisma:418-447`):

```prisma
model TenantSetting {
  // ...existing fields...
  defaultCreditLimit Decimal? @db.Decimal(14, 2)
}
```

`null` = no tenant-wide default (a customer with no `creditLimit` of their own
is unlimited). This is the tenant-level configurability the requirements call
for; `CustomerCredit.creditLimit` is the per-customer override on top of it.

**Effective limit resolution**: `customerCredit.creditLimit ?? tenantSetting.defaultCreditLimit ?? null (unlimited)`.

---

## 4. Feature Flag

Add one row to the existing system `Feature` catalog
(`prisma/schema.prisma:285-296`), the same catalog `PRODUCT`/`CATEGORY`/
`EXTRA_CHARGE`/`CUSTOMER_GROUP` already use:

```
Feature { name: "Credit Payments", code: "CREDIT_PAYMENT" }
```

- **Do not** reuse the code `CREDIT` — it would read confusingly next to the
  `PaymentMethod.CREDIT` enum value; `CREDIT_PAYMENT` keeps them visually
  distinct.
- Wire it into `PlanFeature` seed data for whichever plans should include it,
  and seed `TenantFeature` rows for tenants that should have it enabled by
  default (mirrors how `PRODUCT`/`SALES` etc. are seeded today).
- Server-side check: `withApiAuth({ feature: "CREDIT_PAYMENT", permission: "CREDIT.VIEW" })`
  on every `modules/credit` route, same pattern as
  `app/api/v1/customer-groups/[id]/route.ts:7`.
- Client-side check: `hasFeature("CREDIT_PAYMENT")` from
  `lib/auth/auth-context.tsx` gates the nav item, the POS payment-method
  option, the customer credit-config fields, and the report page — pure UX
  convenience, never the enforcement boundary (`lib/nav/sections.ts:1-13`).
- **Sales route caveat**: `POST /api/v1/sales` itself is gated by the
  `SALES` feature, not `CREDIT_PAYMENT` — a tenant can sell without credit at
  all. So the `CREDIT_PAYMENT` check for a credit sale must happen **inside**
  `sale.service.ts`, conditionally, only when `paymentMethod === "CREDIT"` is
  present among the sale's payments — not at the route's `withApiAuth` level.

---

## 5. Module Structure (`modules/credit/`)

Following `Docs/MODULE_GUIDE.md`'s checklist and `modules/sales/`'s pattern of
multiple sibling features sharing one module folder:

```
modules/credit/
├── controller/
│   ├── credit-account.controller.ts     # GET/PATCH per-customer config (limit, settlement day)
│   ├── credit-payment.controller.ts     # POST a settlement payment
│   └── credit-report.controller.ts      # GET report + GET one customer's ledger
├── service/
│   └── credit.service.ts                # limit resolution/enforcement, balance math, ledger writes
├── repository/
│   └── credit.repository.ts             # Prisma queries, always tenantId-scoped
├── schema/
│   └── credit.schema.ts                 # Zod: upsertCreditConfigSchema, recordCreditPaymentSchema,
│                                         #      openingBalanceSchema, creditReportQuerySchema
├── dto/
│   └── credit.dto.ts                    # UpsertCreditConfigDto, RecordCreditPaymentDto, ...
├── types/
│   └── credit.types.ts                  # CustomerCreditView, CreditTransactionView, CreditReportRowView
├── components/
│   ├── CreditReportTable.tsx
│   ├── CreditTransactionHistoryDialog.tsx   # opened by clicking a report row
│   ├── CreditPaymentForm.tsx
│   └── CustomerCreditConfigFields.tsx       # limit + settlement day, embedded in customer edit form
├── hooks/
│   ├── useCreditReport.ts
│   ├── useCreditTransactions.ts
│   └── useRecordCreditPayment.ts
└── tests/
    ├── credit.service.test.ts
    └── credit.repository.test.ts
```

`sale.service.ts` gets a small, explicit dependency on
`modules/credit/service/credit.service.ts` (limit check + charge recording),
and `sale-return.service.ts` gets the same dependency for the credit-note
reduction described in §9 — rather than the reverse. Credit is a satellite
of sales and sale-returns, not the other way around, matching the existing
one-directional dependency shape described in `Docs/ARCHITECTURE.md`.

---

## 6. API Design

All routes under `app/api/v1/credit/...`, all `withApiAuth`-wrapped with
`feature: "CREDIT_PAYMENT"` and a `CREDIT.*` permission
(`CREDIT.VIEW`, `CREDIT.MANAGE`, following the `<MODULE>.<ACTION>` convention
in `Docs/MODULE_GUIDE.md:23-25`):

| Method | Route | Purpose | Permission |
|---|---|---|---|
| `GET` | `/api/v1/credit/customers` | List customers with their credit config + current balance (paginated) | `CREDIT.VIEW` |
| `GET` | `/api/v1/credit/customers/[id]` | One customer's full credit config + balance (back-office detail view) | `CREDIT.VIEW` |
| `GET` | `/api/v1/credit/customers/[id]/summary` | **POS-facing**: `{ currentBalance, creditLimit, availableCredit }` only — see §10 | `CREDIT.VIEW` |
| `PATCH` | `/api/v1/credit/customers/[id]` | Set/update `creditLimit`, `settlementDay` | `CREDIT.MANAGE` |
| `POST` | `/api/v1/credit/customers/[id]/opening-balance` | Record an existing/opening due amount (one-time, only when the customer has no prior ledger) | `CREDIT.MANAGE` |
| `GET` | `/api/v1/credit/customers/[id]/transactions` | Paginated ledger: date, in/out amount, type, payment method, remarks, running balance | `CREDIT.VIEW` |
| `POST` | `/api/v1/credit/customers/[id]/payments` | Record a cash/UPI/etc. payment against outstanding credit | `CREDIT.MANAGE` |
| `GET` | `/api/v1/credit/report` | Customer-wise report: total credit, payments received, pending, due date | `CREDIT.VIEW` |
| `PATCH` | `/api/v1/tenant-settings` *(existing route)* | Add `defaultCreditLimit` to the existing update payload | `TENANT_SETTING.UPDATE` |

A credit **charge** is never created directly through this API — it's a
side-effect of `POST /api/v1/sales` when one of the sale's payments has
`paymentMethod: "CREDIT"`, produced by `sale.service.ts` calling
`credit.service.recordCharge(...)` inside the same Prisma transaction that
creates the `Sale` and its `Payment` rows. Symmetrically, a **credit note**
is never created directly either — it's a side-effect of
`POST /api/v1/sale-returns` when the originating sale had a `CREDIT`
payment, produced by `sale-return.service.ts` calling
`credit.service.recordCreditNote(...)` (see §9) inside the same transaction
that creates the `SaleReturn` and its inventory movement.

`CREDIT.VIEW` must be included in the default **Cashier/POS role's**
permission set (not just back-office roles) — the POS needs it to call the
`summary` endpoint for every customer it looks up, per §10.

---

## 7. Credit Limit Enforcement

Race-condition-safe by construction: the balance read, limit check, ledger
insert, and `CustomerCredit.currentBalance` update all happen inside **one**
Prisma `$transaction`, mirroring how `sale.service.ts` already wraps
inventory-affecting writes. Sketch:

```
await prisma.$transaction(async (tx) => {
  const account = await tx.customerCredit.findUnique({ where: { tenantId_customerId } });
  const tenantSetting = await tx.tenantSetting.findUnique({ where: { tenantId } });
  const limit = account?.creditLimit ?? tenantSetting?.defaultCreditLimit ?? null;
  const projectedBalance = (account?.currentBalance ?? 0) + chargeAmount;

  if (limit !== null && projectedBalance > limit) {
    // 422 CREDIT_LIMIT_EXCEEDED, same envelope shape as INSUFFICIENT_STOCK
    // (Docs/MOBILE_API_GUIDE.md §6) — details carry the numbers so the POS
    // can render "Due ₹{currentBalance} / Limit ₹{limit}" without a second
    // round trip:
    // { code: "CREDIT_LIMIT_EXCEEDED", message: "...", details: {
    //     currentBalance, creditLimit: limit, attemptedChargeAmount: chargeAmount } }
    throw new CreditLimitExceededError({ currentBalance: account?.currentBalance ?? 0, creditLimit: limit, attemptedChargeAmount: chargeAmount });
  }

  // insert CreditTransaction(type=SALE_CHARGE, direction=OUT, runningBalance=projectedBalance, ...)
  // upsert CustomerCredit.currentBalance = projectedBalance
});
```

A `null` limit (no per-customer override, no tenant default) means
unlimited — same "null is unlimited" convention `Plan.maxWarehouses` already
uses (`shared/utils/plan-limits.ts:10-11`), so existing reviewers/devs
recognize the pattern immediately.

Payments (`direction = IN`) reduce `currentBalance` and are never limit
-checked — only charges are. Whether an overpayment may push the balance
negative (i.e. the store now owes the customer) is an open product question,
flagged in §11.

---

## 8. UI / Feature-Gating Surface

Every one of these must check `hasFeature("CREDIT_PAYMENT")` and render
nothing (not a disabled state — fully absent) when it's off:

- **Nav**: new entry in `lib/nav/sections.ts`, e.g.
  `{ label: "Credit Report", href: "/credit", permission: "CREDIT.VIEW", feature: "CREDIT_PAYMENT" }`.
- **POS / sale checkout payment-method selector**: `CREDIT` option hidden
  from the list when the feature is off (existing methods `CASH/CARD/BANK_TRANSFER/UPI/CHEQUE`
  unaffected either way).
- **Customer create/edit form**: credit limit + settlement-day fields
  (`CustomerCreditConfigFields.tsx`) only rendered when the feature is on.
- **Tenant Settings page**: `defaultCreditLimit` field only rendered when the
  feature is on.
- **Credit Report page** (`/credit`): the page itself 404s/redirects if the
  feature is off, not just link-hidden — defense in depth alongside the
  server-side `withApiAuth` check.
- **Credit Transaction History dialog**: opened from a Credit Report row
  click; fetches `GET /api/v1/credit/customers/[id]/transactions`.

---

## 9. Sale Return / Credit Note Integration

The due amount must stay correct after **either** side of the sale
lifecycle: a sale increases it, a return against a credit-paid sale must
decrease it — automatically, with no separate manual step. This is new
scope: today `sale-return.service.ts` only computes a discount-prorated
`refundAmount` (`modules/sales/service/sale-return.service.ts`, per
`Docs/business-rules/sale-return.md` → "Discount-Aware Refunds") and never
touches `Payment` or any due balance.

### Trigger

Inside `sale-return.service.ts`'s `create()`, in the same transaction that
already writes the `SaleReturn`/`SaleReturnItem` rows and the
`SALE_RETURN_IN` inventory movement: check whether the originating `Sale`
has any `Payment` with `paymentMethod: "CREDIT"`. If none, nothing credit
-related happens — this is an ordinary return with no ledger interaction,
same as today.

### Amount attributed to credit (mixed-payment sales)

A sale can be paid across multiple `Payment` rows (e.g. part `CASH`, part
`CREDIT`). Only the portion of the refund that was actually charged to
credit should reduce the due balance — refunding a cash-paid portion back
onto the credit ledger would be wrong. Resolve it the same way
`sale-return.md`'s discount proration already resolves partial attribution:

```text
saleCreditPortion   = sum of that Sale's Payment.amount where paymentMethod = CREDIT
saleTotalPaid       = sum of that Sale's Payment.amount (all methods)
creditShareOfRefund = refundAmount × (saleCreditPortion / saleTotalPaid)   // clamped ≤ saleCreditPortion
```

`creditShareOfRefund` is what gets recorded as the `CREDIT_NOTE` — the
remainder of `refundAmount` (if any) is refunded through whatever
cash-refund mechanism the Sale Return flow already uses (out of scope
here; this plan only owns the credit-ledger portion).

### Ledger effect

`credit.service.recordCreditNote(tenantId, customerId, { amount: creditShareOfRefund, referenceType: "SALE_RETURN", referenceId: saleReturn.id })`:
- Inserts a `CreditTransaction` (`type: CREDIT_NOTE`, `direction: IN`,
  `referenceType: SALE_RETURN`, `referenceId: saleReturn.id`,
  `runningBalance` = balance after subtracting `creditShareOfRefund`).
- Decrements `CustomerCredit.currentBalance` by `creditShareOfRefund`
  (clamped at 0 — a return can't make a customer's due negative; see the
  overpayment open question in §11, which applies here too).
- **Not limit-checked** — same as a manual `PAYMENT`, a credit note only
  ever reduces the balance, so it can never trip the max-limit guard.

`GET /api/v1/credit/customers/[id]/transactions` shows `CREDIT_NOTE` rows
labeled "Credit Note" with the originating return referenced, so the
customer-facing ledger reads like a real statement of account (charge,
payment, charge, credit note, ...), not just charges and cash payments.

---

## 10. POS Due & Limit Visibility

Requirement: **when a user selects Credit as the payment method at POS, they
must see that customer's existing due amount and max limit before
confirming the sale** — not discover it only after a `422
CREDIT_LIMIT_EXCEEDED` on submit.

### Flow

1. POS already requires picking a `Customer` before checkout (existing
   flow). As soon as a customer is selected **and** `hasFeature("CREDIT_PAYMENT")`
   is true, call `GET /api/v1/credit/customers/[id]/summary`:
   ```json
   { "success": true, "data": { "currentBalance": "4200.00", "creditLimit": "10000.00", "availableCredit": "5800.00" } }
   ```
   `creditLimit`/`availableCredit` are `null` when unlimited (no per-customer
   override and no `TenantSetting.defaultCreditLimit`).
2. Show this inline the moment the payment-method list renders — e.g. under
   the `CREDIT` option: *"Due ₹4,200.00 · Limit ₹10,000.00 · Available
   ₹5,800.00"* — not gated behind actually selecting it, so the cashier can
   see it while still choosing.
3. If the cashier enters a credit amount that would exceed `availableCredit`,
   the client can block optimistically using the already-fetched summary —
   but this is UX only. The **server re-checks unconditionally** on
   `POST /api/v1/sales` (§7); a stale summary (e.g. another till just used up
   the limit) still gets a `422 CREDIT_LIMIT_EXCEEDED` with the fresh numbers
   in `error.details`, which the client should use to update the displayed
   due/limit rather than just showing a generic error.
4. When the feature is off, or the tenant has no `CREDIT_PAYMENT` access,
   `CREDIT` is absent from the payment-method list entirely (§8) — no due
   /limit UI to show in the first place.

### Why a dedicated `summary` endpoint instead of embedding it in the customer payload

`GET /api/v1/customers/[id]` is a general-purpose endpoint used well beyond
POS checkout (customer list/edit, reports, etc.); always joining a credit
lookup onto it would run an extra query on every customer fetch even for
tenants without the feature. A dedicated, feature-gated endpoint keeps the
cost paid only when it's actually needed, and mirrors how
`/sales/delivery-assignees` (`Docs/deliveryAssignment_androidChanges.md` §2)
is its own purpose-built endpoint rather than a field bolted onto an
unrelated payload.

Android-specific request/response details, error handling, and UI wiring
for this flow are written up in full in
`Docs/credit_androidChanges.md`.

---

## 11. Open Questions (need a product decision before/while building)

1. **"Method of Payment: `0`"** — confirm what external numbering this
   refers to (see §1); if it's an Android/legacy ordinal, decide where the
   numeric→enum translation lives (API boundary vs. client).
2. **Overpayment**: does a payment larger than the outstanding balance create
   a negative balance (store owes customer / advance credit), or is it
   rejected/clamped at zero?
3. **Editing/voiding a ledger row**: the ledger is specified as append-only
   (matches `Payment`/`SaleDiscount`'s immutable-audit-trail convention
   elsewhere in this codebase) — corrections should be a new `ADJUSTMENT`
   row, never an edit of history. Confirm this matches expectations.
4. **Settlement-date reminders**: the requirement asks for a due date "for
   reminders" but doesn't specify a channel. This repo already has a
   notification system (`Docs/notification_plan.md`) — reminders would most
   naturally be a new `type: "CREDIT_DUE"` notification fired by a scheduled
   job, but that job and its cadence are out of scope for this plan unless
   confirmed as required now.
5. **Bypassing the limit**: should any role be able to override/bypass the
   credit-limit block (e.g. an Admin approving an exception), or is it a hard
   stop for everyone?
6. **Return refund on a fully-cash sale that later has a manual credit
   payment history unrelated to that sale**: §9's proration only looks at
   the *originating sale's own* payments, never the customer's overall
   balance — confirm that's the intended scope (it should be; a return is
   tied to one sale).

---

## 12. Phased Delivery

1. **Schema**: `customer_credits`, `credit_transactions`,
   `TenantSetting.defaultCreditLimit`, new enums, migration, seed the
   `CREDIT_PAYMENT` `Feature` row (+ `PlanFeature`/`TenantFeature` seeding).
2. **Backend module**: scaffold `modules/credit/` per §5, permissions
   (`CREDIT.VIEW`, `CREDIT.MANAGE`) registered and seeded onto roles
   (`CREDIT.VIEW` on the Cashier/POS role too, per §6/§10), all routes from
   §6, new `CREDIT_LIMIT_EXCEEDED` (422) error code added alongside the
   table in `Docs/MOBILE_API_GUIDE.md` §6.
3. **Sale integration**: `sale.service.ts` calls
   `credit.service.recordCharge(...)` when a sale's payment method is
   `CREDIT`, inside the same transaction (§7); blocks with a clear error when
   over limit.
4. **Sale return integration**: `sale-return.service.ts` calls
   `credit.service.recordCreditNote(...)` per §9, inside the same
   transaction as the return + inventory movement.
5. **Frontend**: Credit Report page + transaction history drill-down, credit
   payment recording form, customer credit-config fields, tenant default
   -limit field, POS payment-method gating with due/limit display (§10) —
   all behind `hasFeature("CREDIT_PAYMENT")`.
6. **Android**: implement `Docs/credit_androidChanges.md` in full —
   payment-method list change, due/limit display, new error handling.
7. **Tests**: `credit.service.test.ts` (limit resolution, over-limit
   rejection, balance math, feature-off behavior), repository tests
   (tenant isolation), `sale.service.test.ts` case for a credit-method sale,
   and a `sale-return.service.test.ts` case for a credit note against a
   mixed-payment sale (§9's proration).
8. **Follow-up (not in this pass unless requirement #4 in §11 is confirmed
   in-scope now)**: settlement-date reminder notifications.
