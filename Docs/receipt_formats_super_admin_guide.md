# Receipt Formats — Super Admin Guide

How to create, preview, and assign POS receipt formats from the Super Admin portal.
This is a how-to guide for using the feature — for the technical schema/API contract
(what an Android developer needs), see `Docs/pos_receipt_format_guide.md` instead.

---

## What this is

A receipt format is the template a POS device prints when a cashier completes a sale —
store name, invoice details, the item list, totals, a QR code, terms & conditions, and
so on. You design it once here; every device it's assigned to prints from it.

You can have several formats (e.g. a compact 58mm one and a wider 80mm one) and control,
per tenant, which one each store or device actually uses.

---

## Where to find it

**Super Admin → Receipt Formats** in the left sidebar (`/super-admin/receipt-formats`).
The list shows every format that exists, its paper width, its version number, whether
it's the global default, and what it's currently assigned to.

---

## Creating a format

1. Click **New format**.
2. Fill in:
   - **Name** — something you'll recognize later, e.g. "58mm Standard".
   - **Paper width (mm)** — 58 and 80 are the common thermal roll sizes, but any width
     works, including something wide like 210 for an A4-style sheet.
   - **Use as the global default** — check this if this format should be the fallback
     when a tenant/store/device has nothing else assigned to it. Only one format can be
     the default at a time; checking this on one automatically un-checks it on whichever
     format held it before.
3. Edit the **Schema (sections JSON)** — this is the actual layout: header text, invoice
   details, the item table, totals, QR code, terms, footer message. A ready-to-edit
   example is pre-filled when you create a new format, so you're editing an existing
   layout rather than starting from a blank box.
   - Click **Show section type reference** above the box for a cheat sheet of every
     section type and its fields, plus the exact list of `{{tokens}}` you're allowed to
     use (e.g. `{{store_name}}`, `{{invoice_no}}`, `{{total}}`). Using a token that's
     not on that list will print as blank on a real device — it won't error, it'll just
     silently show nothing, so it's worth checking against that list before saving.
4. Check the **live preview** below the box — it updates as you type, rendered at the
   receipt's actual physical size, with a centimeter ruler along the top and left edges
   so you can judge real-world size, not just a scaled-to-fit approximation.
5. Click **Download PDF** to print it (or save it as a PDF) on a regular A4 sheet at
   true scale, so you can hold a printout up against a real receipt roll before rolling
   the format out to a tenant. It always prints on exactly one A4 page — a long receipt
   is shrunk to fit rather than spilling onto a second page.
6. Click **Create format** when you're happy with it.

## Editing a format

Click a format's name (or the **Edit** action) from the list to open it. It's the same
form as creating one, pre-filled with the current schema. Saving bumps the format's
version number, which is how an assigned device knows to re-fetch it rather than keep
using a stale cached copy.

An **Assign to tenant / store** button sits at the top of the edit page too, so you don't
need to go back to the list to reassign the format you're already looking at.

## Cloning a format

Use the **Clone** action on the list when you want to start a new format from an
existing one instead of from scratch — useful for a small variant (e.g. the same layout
at a different paper width, or with a store's own footer message). Give the copy a new
name; it starts unassigned and is never accidentally set as the global default, even if
the original was.

## Assigning a format

Use the **Assign** action (on the list, or the button on the edit page) to choose who
prints from this format:

- **Whole tenant** — every store and device under that tenant uses this format, unless
  something more specific overrides it (see precedence below).
- **One store** — just that store (and every device in it), regardless of what the rest
  of the tenant is using.

Pick the tenant from the dropdown, and for a store-level assignment, pick the store from
the second dropdown once a tenant is chosen.

Assigning a format to a scope that already had one just replaces it — there's no need to
"unassign" first.

### Precedence — which format actually wins

A device resolves its format most-specific-first:

**that specific POS device → its store → its tenant → the global default**

So you can assign a format to an entire tenant, and later override it for just one
troublesome store or device without touching the tenant-wide assignment — the more
specific assignment simply wins for that one scope, and everything else keeps using
whatever it already had.

(Assigning a format to one specific POS device isn't available from this UI yet — device
management doesn't have its own screen in the portal. If you need that level of
precision, ask engineering; it's supported by the underlying system already.)

## Deleting a format

Use the **Delete** action. Anything currently assigned to that format — a tenant, a
store, a device — automatically falls back to the next level down in the precedence
order above (its store's assignment, then its tenant's, then the global default). Nothing
is left pointing at a deleted format.

---

## A few things worth knowing before you rely on a format

- **Not everything in the schema editor prints yet.** The reference panel documents a
  few conveniences — an `xs` (extra-small) text size, a `terms` section for fine print, a
  `row` section for side-by-side layout, custom item-table columns beyond the standard
  ones, and totals merged into the item table — that preview correctly here but need a
  matching update on the Android app before they'll actually appear on a printed
  receipt. The reference panel and the live preview both call these out in place (small
  amber notes) wherever you use one, so you'll see it while you're editing, not after
  it's already live.
- **Spelling of `{{tokens}}` matters exactly.** They're case-sensitive and use
  underscores (`{{store_name}}`, not `{{storeName}}`). A misspelled token doesn't error —
  it just prints as an empty space, which is the most common reason a "finished" format
  looks wrong on a real receipt. Always check it against the reference panel's token
  list.
- **Use the PDF download before rolling a format out — but know what it can't catch.**
  Printing (or saving) the PDF and looking at actual paper is the fastest way to check
  layout: does it wrap oddly, crowd a column, fit the physical size you expect. What it
  *can't* catch: the PDF renders through a browser (same as the on-screen preview), while
  a real POS device prints through the thermal printer's own built-in font. A currency
  symbol (₹, most commonly) that looks perfectly fine in the PDF can still print as a box
  on the actual device, because that printer font doesn't have a glyph for it — this is
  invisible in every portal check, only shows up on real paper from a real device. If a
  format is printing boxes where an amount should be, that's not something to fix in the
  schema — it means whoever built the Android app's printing code needs to stop sending
  that symbol as-is to the printer (use "Rs." instead) — flag it to them directly.
