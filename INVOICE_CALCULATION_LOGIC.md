# Invoice calculation logic — server-authoritative pricing

Every screen that shows money to a cashier must show a number the
**server** computed, never one the app derives from line prices,
discounts, or tax rates on-device. This doc records the current state
of that contract per flow, and the backend gap that still needs
closing.

## 1. Sale (checkout) — already server-authoritative

`SaleInvoiceScreen` (`lib/ui/screens/sales/sale_invoice_screen.dart`)
never computes the invoice breakdown itself. It builds a `QuoteInput`
from the cart/customer/coupon and asks the server for a live preview:

```
POST /pricing/quote
```

(`lib/data/repositories/pricing_repository.dart`, model in
`lib/data/models/pricing_quote.dart`). This is a read-only preview —
nothing is persisted, no coupon is redeemed — so it's safe to fire on
every cart/customer/coupon change. `QuoteController`
(`lib/state/pricing_quote_state.dart`) debounces those calls 500ms and
publishes the result as an `AsyncValue<PricingQuote?>`; the screen
renders `subtotal`, `lineDiscountTotal`, `coupon`, `saleDiscount`,
`chargesTotal`, `taxTotal` and `grandTotal` straight off that response.

**Bug fixed 2026-08-28:** the screen only re-requested a quote from a
`ref.listen` hook on cart *changes*. Since the cart is already
populated by the time this screen opens (built on the till screen
before navigating here), that listener never fired on initial load,
so the quote stayed `null` and the summary was stuck on "Add items to
see the invoice." forever, even with a full cart. Fixed by firing an
initial `_refreshQuote()` from `initState()`.

Final charge still goes through `POST /sales`, which independently
recomputes and persists the real total — the quote is preview-only and
is never trusted for the actual charge amount.

## 2. Sale return — no live preview, but no local math either

`SaleReturnCreateScreen` never displays a computed total before
submit. It shows only what was sold (from the original sale) and lets
the cashier pick quantities; the refund breakdown is rendered
**after** the response comes back from:

```
POST /sale-returns
```

using the response's per-item `refundAmount` and `totalRefundAmount`
(`SaleReturn.computedRefund` in `lib/data/models/sale.dart`). This is
correct as far as it goes, but it means the cashier has no idea what
the refund will be until *after* the return is already recorded —
there's no way to preview and back out.

## 3. Sale exchange — client-side estimate only

`SaleExchangeCreateScreen` shows a running "Estimated to
collect/refund" figure while the cashier is picking return lines and
replacement products, computed entirely on-device:

```dart
double get _estimatedReturnValue {
  var total = 0.0;
  _returnQuantities.forEach((saleItemId, quantity) {
    total += quantity * (_returnUnitPrices[saleItemId] ?? 0);
  });
  return total;
}
// estimate = cartSubtotal(replacementLines) - _estimatedReturnValue
```

This uses the **original sale's line price**, not the discount-aware
refund the server would actually compute (line/sale discounts, coupon
proration, tax) — it can't, because no such API exists. The screen
already labels this correctly ("Estimate only — the server applies the
original sale's discounts and returns the exact difference.") and the
actual settlement shown to the cashier after submit comes from the
server response (`differenceAmount` / `differenceDirection` in
`SaleExchange`, via `POST /sale-exchanges`). So nothing here is
*mis*-labeled as authoritative, but the pre-submit number can visibly
disagree with the post-submit one whenever the original sale had any
discount or coupon.

## 4. Backend gap — CLOSED 2026-08-28

`POST /sale-returns/quote` and `POST /sale-exchanges/quote` now exist
(`modules/sales/service/sale-return.service.ts` → `quote()`,
`modules/sales/service/sale-exchange.service.ts` → `quote()`), modeled
directly on `POST /pricing/quote`: read-only, no persistence, no
stock/ledger mutation, gated by the same `*_RETURN.VIEW` permission as
the corresponding list endpoint (not the `CREATE`/`EXCHANGE` permission
`POST` requires, since nothing is actually created).

Each `quote()` shares its computation with the corresponding `create()`
via an extracted helper (`resolveReturnLines` / `resolveExchange`) — the
same discount-proration, pricing, and tax calls, not a second
implementation that could drift from what `create()` actually persists.

One deviation from the request shape sketched below: `sale-exchanges/quote`
does **not** accept a client-supplied `unitPrice` on `newItems` — like
`POST /sale-exchanges`, the price is always resolved server-side
(`resolveItemPrice`), consistent with this doc's own "never derive money
from client input" premise.

Original gap description, retained for the request/response shapes below
(still accurate for `sale-returns/quote`; `sale-exchanges/quote`'s
`newItems` request omits `unitPrice` per the note above):

### `POST /sale-returns/quote`

Request:
```jsonc
{
  "saleId": "…",
  "items": [
    { "saleItemId": "…", "quantity": 1 }
  ]
}
```

Response — same shape `POST /sale-returns` already returns for
`items[].refundAmount` and `totalRefundAmount`, just without creating
the record:
```jsonc
{
  "items": [
    { "saleItemId": "…", "productId": "…", "quantity": 1, "refundAmount": 449.00 }
  ],
  "totalRefundAmount": 449.00
}
```

### `POST /sale-exchanges/quote`

Request:
```jsonc
{
  "saleId": "…",
  "returnItems": [ { "saleItemId": "…", "quantity": 1 } ],
  "newItems": [ { "productId": "…", "quantity": 1, "unitPrice": 599.00 } ]
}
```

Response — same shape as the `saleReturn` / settlement fields on
`POST /sale-exchanges`'s response, just without persisting either leg:
```jsonc
{
  "returnItems": [
    { "saleItemId": "…", "productId": "…", "quantity": 1, "refundAmount": 449.00 }
  ],
  "newItems": [
    { "productId": "…", "quantity": 1, "amount": 599.00 }
  ],
  "chargesTotal": 0,
  "taxTotal": 30.00,
  "differenceAmount": 180.00,
  "differenceDirection": "CUSTOMER_OWES"
}
```

Both should apply the exact same discount/coupon/tax resolution as the
corresponding `create` endpoint, since the whole point is that the
preview and the eventual persisted result must always agree — the
create endpoints stay the source of truth, these are read-only mirrors
of the same calculation.

### Client-side follow-up once these exist

- `SaleReturnCreateScreen`: debounce a call to the new quote endpoint
  on every quantity change (same `QuoteController` debounce pattern as
  checkout) and render the real per-item/refund total instead of
  showing nothing until after submit.
- `SaleExchangeCreateScreen`: replace `_estimatedReturnValue`/the
  local `estimate` getter with the quote response, dropping the
  "Estimate only" disclaimer since the number would then be real.
- Both `PricingRepository`-style thin wrappers, following the existing
  `pricing_repository.dart` / `pricing_quote_state.dart` pattern.

Until the backend adds these, the current client behavior (return:
show nothing until after submit; exchange: show a clearly-labeled
local estimate) is the correct fallback — do not fabricate a more
precise-looking number from local math.
