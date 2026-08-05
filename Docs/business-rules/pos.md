# Business Rules — POS (Android Terminal)

## Idempotent Sync

The POS app is offline-first: sales are created locally while offline and
synced when connectivity returns. Every synced sale must carry a
client-generated `Idempotency-Key`. The server must never create two `Sale`
rows (and two inventory deductions) for the same key — see
`DATABASE.md` → Idempotency. This is not optional retry-hygiene; without it,
a flaky connection during checkout directly causes duplicate stock
deductions and duplicate revenue records.

## Cash Sessions Must Bracket Every POS Sale

A POS sale should only be creatable while its `Terminal` has an `OPEN`
`CashSession`. A sale with no open session for its terminal is a workflow
bug in the client, not a state the server should silently accept — reject it
(`422`) rather than creating an orphaned sale with no shift to reconcile
against.

## Closing a Session

Closing a `CashSession` computes `expectedCash` from
`openingFloat + sum(cash-method sale amounts during the session)` and
compares it to the cashier's counted `closingCash`; the difference is
recorded as `variance`, never silently discarded. A non-zero variance is a
reporting concern (flag for manager review), not a validation failure that
blocks closing the shift.

## One Open Session Per Terminal

A `Terminal` must have at most one `OPEN` `CashSession` at a time — opening a
new session while one is already open is a bug (previous shift wasn't closed
out), not a valid multi-session state.

## Receipt Printing / Hardware

Receipt printing, barcode scanner input, and cash drawer triggering are
Android-client concerns with no backend equivalent — the server's
responsibility ends at returning a completed `Sale` + its line items in the
API response.
