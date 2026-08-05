# Business Rules — Stock Transfer

## Two-Phase Movement, Not One

A transfer is `DRAFT → IN_TRANSIT → COMPLETED`, not a single atomic move.
Stock leaves the source warehouse on **ship** (`DRAFT → IN_TRANSIT`) and
only credits the destination on **receive** (`IN_TRANSIT → COMPLETED`) —
two separate `InventoryTransaction` rows (`TRANSFER_OUT` then `TRANSFER_IN`),
not one. This models the real gap between dispatch and arrival: while
`IN_TRANSIT`, the goods are logically gone from the source but not yet at
the destination, the same way they'd actually be sitting in a truck.

## Insufficient Stock

Shipping enforces the same stock-sufficiency guard as every other outbound
movement (see `inventory.md` → Negative Stock) — a transfer whose source
doesn't have enough stock is rejected at **ship** time, not at creation.
Creating a `DRAFT` transfer never touches inventory, so it can be created
before stock is confirmed available; ship is the actual commitment.

## Cancellation

- `DRAFT` → `CANCELLED`: no inventory impact, nothing has moved yet.
- `IN_TRANSIT` → `CANCELLED`: the source must be credited back (a
  `TRANSFER_IN` reversal at the source warehouse) — never a silent balance
  edit, same principle as reversing a cancelled `CONFIRMED` sale (see
  `sales.md` → Cancellation).
- `COMPLETED` cannot be cancelled — both sides have already settled; use a
  new transfer in the opposite direction if the movement needs undoing.

## Same Warehouse Twice

`fromWarehouseId` and `toWarehouseId` must differ — a transfer to the same
warehouse it started from isn't a transfer and is rejected at creation.
