# Void log

Status 2026-11-05: POS and server halves are built. Server (aimatic `f2e0e83`, `c21803f`) is live on szl; this POS work is on branch `pos-void-reason` (based on v3.0.38) and is **not released**. Until tills run a release containing it, ERP receives no voids.

## Why
ERP only sees completed sales. A cashier could scan items, remove them and keep the money; before this, nothing recorded it. The server only logged supervisor *approvals* (`POS Admin Audit Log`), and a cashier with `canVoidItems` voided with no approval and no record.

## What the POS records
`line_void` (cart line removed, incl. quantity going to 0), `clear_cart`, `held_sale_deleted`. Each event: `eventId` (idempotency key), kind, createdAt, cashierUser/Name, posProfile, terminalId, hardwareId, openingEntry, customer, `authorizedBy`, lines[{itemCode,itemName,uom,qty,rate,amount}], totalAmount, note, `reason`.
- `authorizedBy`: `supervisor_prompt` only when a supervisor password was actually checked for this void; otherwise `cashier_privilege` (the cashier's own decision). Held-sale delete never asks a supervisor, so it is always `cashier_privilege`.
- `reason`: asked only when POS Profile **Require Void Reason** (`custom_require_void_reason`) is checked; default off so retail tills have no extra step. The reason is asked before any supervisor prompt (a cancelled reason never burns an authorization), cancelling it cancels the void, and the dialog owns the keyboard while open (Delete/F8/F10/F9/`/` cannot start another action). Max 500 characters, same as the server.
- Code: `src/domain/void-log.ts` (pure), `src/core/void-log.ts` (store + sync), renderer `recordVoidEvent` / `askVoidReason`, IPC `void-log:*`, Android via `mobile.ts`. Stored in `app_meta` key `void_log_v1`, capped at 5000; unsynced events are never dropped, synced ones are pruned after 90 days. Recording never blocks the cart.
- Synced on each recorded void when online and with every sale-queue sync (reconnect, Sync Now, before Close Shift).
- UI: Sales History → **Voids** tab (date range; search by cashier, item, customer or reason; "waiting to send / sent to ERP"); shift summary print has "Voids this shift".

## Server contract
`POST /api/method/aimatic.offline_pos.api.log_pos_voids` with `pos_profile` and `events` = JSON string of events (without `syncedAt`/`attempts`). Response `{"message": {"accepted": [eventId...], "rejected": [{eventId, error}]}}`; only accepted events are marked sent, the rest retry. The server stores them in `POS Void Log` (+ `POS Void Log Item`), recomputes value as qty × rate, and shows them in Sales Dashboard → Voids / Void Details and the Discord Sales card.

## To verify on a real till after release
1. Void a line online → row in `POS Void Log`; Voids tab shows "sent to ERP".
2. Offline: void, Clear Cart, delete a held sale → "waiting to send"; reconnect → each syncs once, no duplicates after a second sync.
3. Cashier with and without `canVoidItems`: `authorizedBy` correct; held delete is `cashier_privilege`.
4. Profile with Require Void Reason on: reason dialog appears and the reason reaches ERP; with it off, no dialog.
5. Dashboard totals match the Voids tab for a shift.

## Known limits
- Quantity reductions that stay above 0 (e.g. 5 → 2) are not logged; only whole-line removal.
- Which supervisor approved is not recorded (the POS only knows an approval happened).
- Value is qty × selling price before tax.
- A cart abandoned by logging out / closing the app is not logged.
