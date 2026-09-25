# Receipt Format Examples

Three ready-to-paste schemas for the Super Admin → Receipt Formats → New format screen.
Each JSON block below goes into the **Schema (sections JSON)** box; the Name/Paper width
noted above each goes into their own form fields (not part of the JSON).

See `Docs/receipt_formats_super_admin_guide.md` for how to use the screen, and
`Docs/pos_receipt_format_guide.md` for which section fields are real (print today) vs.
portal-preview-only (need an Android update first).

---

## 1. 58mm — Simple Store Receipt (no table, real-device-safe)

**Name:** `58mm Store Receipt` · **Paper width:** `58`

Minimal item list (just Item + Total, no separate Qty/Price columns) with `"bordered":
false` so it prints as a plain list, no grid lines — totals shown as plain lines below.
Uses only real, currently-printable section types — nothing here is preview-only.

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
    { "type": "items", "columns": ["name", "total"], "bordered": false },
    { "type": "divider" },
    { "type": "keyvalue", "key": "Subtotal", "value": "{{subtotal}}" },
    { "type": "keyvalue", "key": "Tax", "value": "{{tax}}" },
    { "type": "keyvalue", "key": "TOTAL", "value": "{{total}}", "bold": true },
    { "type": "spacer", "lines": 1 },
    { "type": "qr", "value": "{{invoice_no}}" },
    { "type": "text", "value": "Thank you! Visit again.", "align": "center", "size": "small" }
  ]
}
```

---

## 2. 180mm — Krishi Kendra Invoice (full table)

**Name:** `180mm Krishi Kendra Invoice` · **Paper width:** `180`

Full item table with custom column headers and totals merged into it, plus a terms block
for return/expiry policy.

```json
{
  "sections": [
    { "type": "text", "value": "{{store_name}}", "align": "center", "bold": true, "size": "large" },
    { "type": "text", "value": "{{address}}", "align": "center", "size": "small" },
    { "type": "divider" },
    { "type": "keyvalue", "key": "Invoice No", "value": "{{invoice_no}}" },
    { "type": "keyvalue", "key": "Date", "value": "{{date}} {{time}}" },
    { "type": "keyvalue", "key": "Cashier", "value": "{{cashier}}" },
    { "type": "divider" },
    {
      "type": "items",
      "columns": ["name", "qty", "price", "total"],
      "headers": { "name": "Item", "qty": "Qty", "price": "Rate", "total": "Amount" },
      "bordered": true,
      "totals": [
        { "label": "Subtotal", "value": "{{subtotal}}" },
        { "label": "Discount", "value": "{{discount}}" },
        { "label": "Tax (GST)", "value": "{{tax}}" },
        { "label": "Grand Total", "value": "{{total}}", "bold": true }
      ]
    },
    { "type": "spacer", "lines": 1 },
    { "type": "terms", "value": "Goods once sold will not be taken back.\nCheck seed/fertilizer expiry before purchase.\nWarranty as per manufacturer terms only." },
    { "type": "spacer", "lines": 1 },
    { "type": "qr", "value": "{{invoice_no}}" },
    { "type": "text", "value": "Thank you for your business!", "align": "center" }
  ]
}
```

⚠️ `headers`/`totals`-in-table and `terms` are portal-preview-only — correct here and in
the downloaded PDF, but need an Android app update before a real POS device prints them.
Given this one's width (180mm), it's more likely headed for an office/invoice printer
than a thermal POS anyway.

---

## 3. Recommended — 80mm, general-purpose

**Name:** `80mm Recommended` · **Paper width:** `80`

A balanced middle ground: a `row` putting Invoice/Date side by side, a labeled item
table, totals as real working lines, and a small-print footer.

```json
{
  "sections": [
    { "type": "text", "value": "{{store_name}}", "align": "center", "bold": true, "size": "large" },
    { "type": "text", "value": "{{address}}", "align": "center", "size": "small" },
    { "type": "divider" },
    {
      "type": "row",
      "sections": [
        { "type": "keyvalue", "key": "Invoice", "value": "{{invoice_no}}" },
        { "type": "keyvalue", "key": "Date", "value": "{{date}}" }
      ]
    },
    { "type": "keyvalue", "key": "Cashier", "value": "{{cashier}}" },
    { "type": "divider" },
    {
      "type": "items",
      "columns": ["name", "qty", "price", "total"],
      "headers": { "name": "Item", "qty": "Qty", "price": "Price", "total": "Total" }
    },
    { "type": "divider" },
    { "type": "keyvalue", "key": "Subtotal", "value": "{{subtotal}}" },
    { "type": "keyvalue", "key": "Discount", "value": "{{discount}}" },
    { "type": "keyvalue", "key": "Tax", "value": "{{tax}}" },
    { "type": "keyvalue", "key": "TOTAL", "value": "{{total}}", "bold": true },
    { "type": "spacer", "lines": 1 },
    { "type": "qr", "value": "{{invoice_no}}" },
    { "type": "text", "value": "Thank you, visit again!", "align": "center", "size": "small" },
    { "type": "text", "value": "No refunds after 7 days.", "align": "center", "size": "xs" }
  ]
}
```

⚠️ Two portal-only bits here too: the `row` (Invoice/Date side by side) and `size: "xs"`
on the last line — both preview correctly but won't render that way on a real device yet.
Everything else (item table headers, totals as separate lines, QR) is real and prints
today.
