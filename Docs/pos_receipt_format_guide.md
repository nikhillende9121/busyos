# POS Receipt Format — Backend & Portal Guide

This is the backend/portal-side counterpart to the Android app's own receipt-format
development guide. It documents:

1. The exact schema contract a Super Admin authors (Section 1) — section types, every
   field each one takes, text sizing, spacing, alignment.
2. The exact API shape this backend returns to the Android app (Section 2), verified
   field-by-field against the Android guide, with every deliberate deviation called out.
3. Where this lives in code (Section 4), for whoever touches this next.

If you're implementing or reviewing the Android side, Section 2 is the part that
matters — it's the literal wire contract, not a paraphrase.

---

## 0. Does the Super Admin preview/PDF actually match the printed receipt?

This section was audited directly against the real client app's source
(`C:\Users\CSI\Pro\retail` — the Flutter app covering Android, Windows desktop, and web)
and every confirmed gap below was fixed there in the same pass, not just documented.

### Fixed: the currency-symbol boxes

**Root cause**: `ReceiptTokenResolver.buildTokens()` (fills in `{{subtotal}}`/`{{tax}}`/
`{{discount}}`/`{{total}}` from the real sale) formatted those four amounts with
`money()` — the app's normal on-screen currency formatter, which uses a literal `₹`
glyph. Correct for phone/browser UI (Unicode-aware); wrong for a receipt, on *either*
print path: ₹ has no representation in the 8-bit code page (e.g. CP437) a thermal
printer's built-in font uses, and the PDF renderer's default font is one of the base-14
PDF fonts (Helvetica), which predates ₹ the same way those code pages do — both print a
box, not a rupee sign.

**Fixed**: `lib/core/formatters.dart` gained two ASCII-only formatters —
`receiptAmount()` (`"Rs. 1248.00"`, for the one bold grand-total-style line) and
`receiptPlainAmount()` (`"1248.00"`, no prefix, for per-item table cells) — mirroring the
convention the app's own legacy (pre-schema) renderer already used, just not applied
everywhere. `ReceiptTokenResolver.buildTokens()`, the ESC-POS renderer's per-item cells,
and the PDF renderer's per-item cells (which had the exact same `money()` bug,
independently) all now use these instead. `money()` (with ₹) is untouched everywhere
else in the app — only receipt-print text changed.

**What you can still control from the schema**: never hardcode a currency symbol into a
`text`/`keyvalue` section's *static* value (e.g. a label like `"Total (₹)"`) — the same
box-printing problem applies to any literal text you author, not just the amount tokens.
Use `"Rs."` or the currency code instead.

### Fixed: `image` (logos never rendered on either path)

Modeled correctly but never actually drawn — both renderers just returned nothing,
silently. Fixed: a new `ReceiptImageLoader` fetches the URL's bytes (never throws — a
broken/unreachable logo can't stop the rest of the receipt from printing), and both
renderers now render it — `esc_pos_utils_plus`'s `Generator.image()` for ESC-POS,
`pw.MemoryImage`/`pw.Image` for PDF.

### Fixed: `row` (side-by-side layout) — was not implemented at all

Added a `RowSection`/`RowChild` model (`lib/data/models/receipt_format.dart`) and support
in both renderers. **PDF**: a real `pw.Row`, exactly like the portal preview — no
technical limitation there. **ESC-POS**: this needed a real design decision, since
`Generator.row()` only accepts single-line text columns whose widths must sum to exactly
12 — so a row of `text`/`keyvalue` children renders as true side-by-side columns
(each child's `width` becomes a proportional share of those 12 units); a row holding
anything else (a nested table, image, graphic, or another row) — or more children than a
12-unit grid can give one column each — falls back to stacking every child in order
instead of dropping them or crashing the print job.

### Genuine hardware limit, not a software gap: `xs` on ESC-POS (Bluetooth)

The PDF path sizes `xs` correctly (a real, smaller point size). On ESC-POS, checked
`esc_pos_utils_plus`'s `PosTextSize` enum directly: it only defines `size1` (the base
font) through `size8` (8×) — there is no sub-1 multiplier. The thermal-printer character-
size command this library wraps (`GS !`) has no way to print *smaller* than a printer's
own base font at all — `small`/`normal`/`xs` are all already the smallest size a real
thermal printer can produce, so there's nothing to implement here; the printed distinction
`small` vs. `xs` (or vs. `normal`) can only ever exist on paper via the PDF/desktop path.

### A custom `items` column still has nothing to fill it with

`name`/`qty`/`price`/`total` are the only fields the app's per-item data actually carries
— confirmed directly in the renderers. This isn't a rendering bug to fix; a genuinely new
column (e.g. `"sku"`) needs the app's own per-item data model extended first, since the
schema only says how to lay out data the app already has.

### Already working, previously mis-documented as portal-only

`terms` and `items.totals` were already fully implemented in the real app's renderers
before this audit — they print exactly as previewed. Earlier revisions of this doc called
them portal-only, carried over from the original generic Android spec this guide started
from; that was inaccurate for this actual app.

---

## 1. The schema contract

A receipt format's `schema` column is `{ "sections": [...] }` — an ordered list of
sections, each rendered top to bottom. The app tolerates unknown `type`s (skips them,
never crashes), so new section types can ship here before the app is updated — but the
fields *within* a known type must match exactly, since the app reads them by literal key.

**The main content field is always `value`, never `content`.** This is the single most
common mistake when hand-authoring a schema — `text`, `image`, `barcode`, and `qr` all
use `value`; only `keyvalue` additionally has `key`.

| type       | fields                                                                        | notes |
|------------|--------------------------------------------------------------------------------|-------|
| `text`     | `value` (string, may contain `{{tokens}}`), `align` (`left`\|`center`\|`right`), `bold` (boolean), `size` (`xs`\|`small`\|`normal`\|`large`) | one line of text |
| `keyvalue` | `key` (string), `value` (string, may contain `{{tokens}}`), `bold` (boolean) | label on the left, value on the right, same line |
| `divider`  | *(no fields)*                                                                 | full-width separator line |
| `items`    | `columns` (array — any subset/order of `"name"`, `"qty"`, `"price"`, `"total"`; see the custom-column note below), `headers` (object, column key → custom label, e.g. `{ "name": "Product" }`), `totals` (array of `{ label, value, bold? }` — Subtotal/Tax/Total rows merged into this table as a footer, fully supported — see below), `bordered` (boolean, default `true`) | renders the sale's line items **as a table, with a header row** — `columns` controls which columns show and their order, `headers` controls each one's label, `bordered: false` drops the grid lines for a plain list look |
| `image`    | `value` (an image URL), `align` (`left`\|`center`\|`right`)                  | logo, fully supported on both print paths — see below |
| `barcode`  | `value` (string, may contain `{{tokens}}`)                                   | symbology defaults to `code128` on the app side — see the note below |
| `qr`       | `value` (string, may contain `{{tokens}}`)                                   | |
| `spacer`   | `lines` (integer)                                                             | blank vertical space, that many text-lines tall |
| `terms`    | `value` (string, `\n`-separated lines, may contain `{{tokens}}`), `align`, `size` (defaults to `xs`) | a small-print terms & conditions block, fully supported — see below |
| `row`      | `sections` (array of section objects, any type, even a nested `row`), each child's own optional `width` (number, default `1`, relative share) | lays its children out **side by side** instead of stacked, fully supported — see below |

Note on `items.bordered`: unlike the other `items` extras above, this one carries **no**
device-support caveat either way — a real thermal printer never draws box-border grid
lines regardless of what this is set to, so it's purely how the Super Admin UI's own
preview chooses to render the table while authoring. `false` gives a plain list (no grid
lines), closer to how most compact thermal receipts actually look in practice.

✅ **`terms` is fully supported by the real client app** (`C:\Users\CSI\Pro\retail`, the
Flutter app covering Android + Windows desktop + web — confirmed directly in its code,
both the ESC-POS renderer and the PDF renderer implement a `terms` case). The original
generic Android spec this guide started from didn't have this section type, which is why
earlier revisions of this doc called it portal-only — that's now out of date for the
actual app. Still worth knowing: any *other* client ever built against this same schema
(if one exists) inherits the same forward-compatible "unknown type → skip" rule, so
`terms` would silently vanish there until that client adds support too.

✅ **`row` is fully supported by the real client app.** PDF renders a true side-by-side
`pw.Row`, identical to the portal preview. ESC-POS is more constrained by the hardware —
`Generator.row()` only accepts single-line text columns — so a row of `text`/`keyvalue`
children prints as real side-by-side columns; a row holding anything more complex (a
nested `items` table, `image`, `qr`/`barcode`, or another `row`) — or more children than
fit a 12-unit grid — falls back to printing every child stacked, in order, rather than
dropping any of them.

**Text sizing** (`size` on a `text` section): `xs` / `small` / `normal` (default) / `large`.
There's no numeric point size — the app maps these buckets to its own font scale so
a receipt stays legible at both 58mm and 80mm.

⚠️ **`xs` only takes effect on the PDF/desktop print path — and this is a printer
hardware limit, not a fixable app gap.** The PDF renderer gives `xs` its own smaller font
size. On ESC-POS (`esc_pos_utils_plus`'s `PosTextSize` enum), the printer's character-size
command only offers `size1` (the base font) through `size8` (8×) — there's no way to
address anything *smaller* than a printer's own base font. `small`/`normal`/`xs` are
already the smallest size a real thermal printer can produce, so on a Bluetooth-printed
receipt they're indistinguishable by design, not by omission.

**Spacing**: there's no generic margin/padding field on any section — vertical spacing is
entirely `divider` (a visible rule) and `spacer` (blank space, sized in `lines`) between
sections. Horizontal spacing on a `keyvalue` row is automatic (label left, value right,
filled to the paper width); a `text` section's `align` is its only horizontal control.

**Paper width isn't limited to narrow thermal rolls.** `paperWidth` is a plain integer
(mm) with no enforced range — a wide/landscape format (e.g. `210` for an A4-style sheet)
is just as valid as `58`/`80`, and the Super Admin UI's live preview renders it at true
physical scale (with a cm ruler on both edges) rather than squeezing everything into a
fixed-size box, so what you see is close to what actually prints.

⚠️ **A custom `items` column previews, but doesn't print, until the app supports it.**
`name`/`qty`/`price`/`total` are the only fields the Android app's on-device line-item
data actually carries per item (see its own transaction-data example: each item is just
`{ name, qty, price, total }`). The Super Admin UI's `columns` array will accept any key
you put in it — e.g. `"sku"` — and the live preview shows it with placeholder "— sample —"
values so you can see the layout, but on a real device that column renders blank, since
there's no `sku` value in the app's item data to fill it with. Getting a genuinely new
column onto a real receipt requires the Android app's line-item data model to be
extended first — this backend and portal have no part to play in that (the `schema` JSON
only says how to lay out data the app already has).

✅ **`items.totals` (Subtotal/Tax/Total merged into the table) is fully supported by the
real client app** — confirmed directly in both `_renderItems` (ESC-POS) and `_buildItems`
(PDF) in the app's code, both honor `totals` and render each row as part of the same
table. The default template uses it for exactly this reason. (Separate `keyvalue` rows
after `items` also still work — either approach is fine; `totals` just keeps the totals
visually inside the same table box.)

✅ **`image` is fully supported on both print paths.** A new `ReceiptImageLoader`
(`lib/printing/receipt_image_loader.dart`) fetches the URL's bytes — the ESC-POS renderer
decodes them with the `image` package and hands them to `Generator.image()`; the PDF
renderer passes the raw bytes straight to `pw.MemoryImage`. A broken/unreachable/corrupt
URL never throws and never blocks the rest of the receipt — that section is just skipped.

⚠️ **Barcode symbology field is ambiguous in the original Android spec.** Its own field
table lists a `type` property for the barcode's symbology (e.g. `code128`) — but that
collides with the section's own dispatch key, which is *also* called `type` and is
already `"barcode"` for this section. The Android reference implementation in that spec
reads `s['type']` again inside the `barcode` case, which would just read back
`"barcode"`, not a real symbology. Until the Android side confirms/fixes this (most
likely by renaming the field to something like `format`), don't rely on setting barcode
symbology from the schema — every barcode renders as the app's hardcoded default
(`code128`) regardless of what's authored here.

### Example (what `DEFAULT_SCHEMA` in the Super Admin UI pre-fills)

```json
{
  "sections": [
    { "type": "text", "value": "{{store_name}}", "align": "center", "bold": true, "size": "large" },
    { "type": "text", "value": "{{address}}", "align": "center", "size": "small" },
    { "type": "divider" },
    { "type": "keyvalue", "key": "Invoice", "value": "{{invoice_no}}" },
    { "type": "keyvalue", "key": "Date", "value": "{{date}} {{time}}" },
    { "type": "keyvalue", "key": "Cashier", "value": "{{cashier}}" },
    { "type": "divider" },
    {
      "type": "items",
      "columns": ["name", "qty", "price", "total"],
      "headers": { "name": "Item", "qty": "Qty", "price": "Price", "total": "Total" },
      "totals": [
        { "label": "Subtotal", "value": "{{subtotal}}" },
        { "label": "Discount", "value": "{{discount}}" },
        { "label": "Tax", "value": "{{tax}}" },
        { "label": "TOTAL", "value": "{{total}}", "bold": true }
      ]
    },
    { "type": "spacer", "lines": 1 },
    { "type": "qr", "value": "{{invoice_no}}" },
    { "type": "spacer", "lines": 1 },
    { "type": "terms", "value": "All sales are final.\nGoods once sold will not be exchanged or refunded." },
    { "type": "text", "value": "Thank you!", "align": "center" }
  ]
}
```

### Allowed placeholder tokens

The Android app builds its on-device data map with **exactly these snake_case keys** —
any other spelling (e.g. `{{storeName}}`, `{{invoiceNumber}}`) silently renders as an
empty string on the device, since an unresolved token is replaced with `""`, not left
visible and not an error. This is the #1 way a hand-authored schema "looks fine" in the
portal but prints blank fields on a real device — always author against this exact list:

```
{{store_name}} {{address}} {{invoice_no}} {{date}} {{time}}
{{cashier}} {{subtotal}} {{tax}} {{discount}} {{total}}
```

(`{{items}}` also exists as a data key, but it's an array consumed by the `items`
section type, not a scalar token you'd drop into a `text`/`keyvalue` value.)

Validation is deliberately **loose** on the backend (see
`modules/receipt-format/schema/receipt-format.schema.ts`) — only `{ sections: [{ type:
string, ...anything }] }` is enforced. Field names above aren't checked by a Zod enum;
getting them right is on whoever authors the schema. The Super Admin UI's live preview
(and its "Show section type reference" panel) exists specifically to catch mistakes
before they reach a device.

---

## 2. Backend ⇄ Android app contract

This is what this backend's `/pos/{posId}/receipt-format` endpoints actually return —
verified against the Android app's own guide, with every place this implementation
deviates from that guide's literal examples called out and justified.

### 2.1 `GET /pos/{posId}/receipt-format`

Auth: `Authorization: Bearer <token>` (same POS/user token as every other
`/api/v1/**` route), permission `SALE.VIEW`.

```json
{
  "success": true,
  "message": "Receipt format retrieved",
  "data": {
    "formatId": "12",
    "name": "Default Store Receipt",
    "version": 7,
    "paperWidth": 58,
    "schema": { "sections": [ ... ] }
  }
}
```

Resolution precedence (most specific wins): **POS device → store → tenant → global
default**. `404 RESOURCE_NOT_FOUND` if nothing resolves at any level (no assignment
anywhere and no format has `isDefault: true`) — same as "no format resolved" in the
Android guide; the app should fall back to its bundled default schema in that case.

⚠️ **The store-level (`"WAREHOUSE"`) check no longer depends on `posId` matching an
existing `Terminal` row — it used to, and that was a bug.** Since `Terminal` has no
create/list UI anywhere in the portal (see `prisma/schema.prisma`'s `Terminal` comment),
`posId` could never resolve to a real row in practice, so that lookup 404'd on every real
call before it ever reached the tenant-level or default fallback — meaning a tenant-wide
assignment was effectively unreachable. `posId` is no longer required to exist as a
`Terminal` at all now: the terminal-level check still uses it as-is (for the rare case a
real `Terminal` row and an assignment for it both exist), but the *store*-level check now
uses the caller's own `warehouseId` from their auth token (`AuthContext.warehouseId`, see
`shared/middleware/with-api-auth.ts` — already set for a warehouse-scoped POS user)
instead. Net effect: a tenant-level assignment now always resolves regardless of whether
`posId` corresponds to anything real, which is the behavior actually needed today.

### 2.2 `GET /pos/{posId}/receipt-format/version`

Same auth/permission. Lightweight — call on startup, only fetch 2.1's full payload when
this differs from the cached version.

```json
{ "success": true, "message": "Receipt format version retrieved", "data": { "version": 7 } }
```

### 2.3 Two deliberate deviations from the Android guide's literal examples

The Android guide's own JSON examples show a flat, un-enveloped response
(`{ "formatId": 12, ... }` directly, no wrapper) with `formatId` as a bare number. This
implementation does **not** match that literally — on purpose:

1. **The `{success, data, message}` envelope is kept**, not flattened. Every other
   endpoint this same Android app already calls (sales, products, everything in
   `Docs/MOBILE_API_GUIDE.md`) uses this envelope — the app's HTTP layer already expects
   to unwrap it. Special-casing just this one endpoint to skip the envelope would be a
   worse mismatch than what it's trying to avoid.
2. **`formatId` is a JSON string (`"12"`), not a bare number.** Every other id this app's
   mobile API returns is a string (see `Docs/MOBILE_API_GUIDE.md` — `"id": "4"`, not
   `4`) because ids are 64-bit `BigInt` server-side and JS/JSON numbers above 2^53 lose
   precision. Matching that existing, already-shipped convention beats matching one
   example in a generic guide.

If the Android team specifically needs a bare int for `formatId`, say so and this can be
special-cased — but as of this writing, no other part of this app's mobile API does that,
so this endpoint doesn't either.

### 2.4 What did match exactly (no changes needed)

- `paperWidth`, `version`, and `schema: { sections: [...] }` — same shape, same names.
- Resolution precedence (POS → store → tenant → default) and the 404-on-nothing-resolved
  behavior.
- The version-check endpoint's minimal `{ version }` payload (inside `data`).

---

## 3. Portal-side endpoints (Super Admin only — the Android app never calls these)

Base path `/api/v1/super-admin/receipt-formats`, auth via `withSuperAdminAuth` (platform
staff, not a tenant user).

```
GET    /receipt-formats                list every format + its current assignments
POST   /receipt-formats                create — { name, paperWidth, schema, isDefault }
GET    /receipt-formats/{id}           get one
PUT    /receipt-formats/{id}           full replace — bumps `version` by 1
DELETE /receipt-formats/{id}           soft delete — unassigns it from everything it was assigned to
POST   /receipt-formats/{id}/assign    body: { tenantId? } | { warehouseId? } | { terminalId? } — exactly one
POST   /receipt-formats/{id}/clone     body: { name } — duplicates schema/paperWidth, never isDefault or assignments
```

One deliberate simplification vs. the Android guide's own sketch of this endpoint: that
guide's `/assign` takes **arrays** (`{ tenantIds?, storeIds?, posIds? }`) for bulk
assignment in one call. This implementation takes exactly **one** scalar target per call
(`tenantId` *or* `warehouseId` *or* `terminalId`) instead — simpler to reason about and
to build a picker UI for; bulk-assigning to N tenants is N calls. Since the Android app
never calls this endpoint, this doesn't affect the device contract — only the Super Admin
UI, which already calls it this way.

`warehouseId`/`terminalId` are this app's own vocabulary for what the Android guide calls
"store" and "POS device" respectively (see `prisma/schema.prisma`'s `Warehouse` and
`Terminal` models).

POS-device-level (`terminalId`) assignment has no picker in the Super Admin UI — `Terminal`
has no listing/search screen anywhere in the portal yet, so there's nothing to pick from.
It's fully functional via a direct API call in the meantime.

---

## 4. Where this lives

- `prisma/schema.prisma` — `ReceiptFormat`, `ReceiptFormatAssignment` models.
- `modules/receipt-format/` — repository, service (`resolveForTerminal` is the
  precedence-resolution logic), schema, dto, types, controllers, tests.
- `app/api/v1/pos/[posId]/receipt-format/**` — the Android-facing routes (Section 2).
- `app/api/v1/super-admin/receipt-formats/**` — the authoring routes (Section 3).
- `app/super-admin/(dashboard)/receipt-formats/` — the authoring UI:
  - `page.tsx` — the list, plus the Clone/Assign/Delete dialogs (small enough to stay
    as dialogs).
  - `new/page.tsx` / `[id]/page.tsx` — full-page create/edit forms, not modals — the
    schema JSON textarea + live preview need more room than a dialog comfortably gives.
  - `receipt-format-form.tsx` — the shared form: fields, the live preview (rendered
    against sample data using the exact field names and tokens from Section 1, with a
    cm ruler and true-physical-scale sizing), and a "Download PDF" button
    (`window.print()` into a fixed one-A4-page layout — content is scaled down, never
    up, only when it would otherwise span multiple pages).
  - `assign-format-dialog.tsx` — the tenant/store assignment dialog, shared between
    the list page and the edit page's own "Assign to tenant / store" button.
