# POS Architecture Notes

Last updated: 2026-07-03

## Source Of Truth

ERPNext is authoritative for:

- Final invoice calculations
- Stock
- Accounting
- POS Invoice submission
- Refund / return submission
- FBR final submission
- POS Opening Entry and POS Closing Entry

Electron is responsible for:

- Desktop cashier UI
- Local SQLite cache
- Offline item/customer/config lookup
- Local cart and payment draft
- Offline queue storage
- Receipt preview and print flow
- Syncing queued sales when ERPNext is reachable

Electron must never call FBR directly.

## Main Local Components

- `src/main.ts`
  - Electron main process.
  - Owns IPC handlers.
  - Owns SQLite access through `src/db/database.ts`.
  - Calls ERPNext APIs.
  - Prints receipts.

- `src/preload.ts`
  - Narrow renderer bridge.
  - Renderer must not access SQLite, Node, credentials, or FBR directly.

- `src/renderer/renderer.ts`
  - POS UI state and workflows.
  - Cart, customer, payment, receipt, sales history, refund screen.

- `src/db/database.ts`
  - SQLite schema and persistence helpers.
  - Settings, cache, held sales, sale history, offline queue, receipt cache.

## Security Rules

- Keep Node integration disabled in renderer.
- Keep preload APIs narrow.
- Do not expose API secret or SQLite to renderer.
- Do not store raw PIN values.
- Use separate local PIN scopes:
  - Settings PIN protects settings, credentials, diagnostics, and force sync.
  - Shift PIN protects Start Shift and Close Shift.
- Keep terminal API key/secret as background integration credentials.
- Cashier login is a separate online ERPNext verification step.
- Do not store cashier passwords.
- Cold offline cashier login uses a local Offline Cashier PIN only after prior online ERPNext cashier verification.
- Store only salted `scrypt` hashes for local PINs.
- Offline Cashier PIN is scoped to terminal, POS Profile, and cashier user.
- Do not display the terminal API user as the cashier.
- Do not store supervisor passwords.
- Do not hardcode shared production passwords.

## Operational Rules

- Online sale uses ERPNext live session and submit API.
- Offline sale queues locally only when local essentials exist.
- Refund remains online-only.
- Close Shift remains online-only.
- Customer creation remains online-only.
- Force sync and credential changes remain protected operations.

## Sync Principle

Queued offline sales must keep the same `terminal_invoice_id`.

Server APIs must be idempotent by terminal invoice/refund IDs.

Do not lose, duplicate, or silently discard queued sales.
