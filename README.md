# Aimatic POS App

Windows desktop POS for ERPNext retail stores.

Built with Electron, TypeScript, SQLite, ERPNext/Frappe APIs, and FBR-ready server integration.

## Current Version

```text
2.1.1
```

## What This App Does

- Runs as a Windows desktop POS terminal.
- Uses ERPNext as the source of truth for invoices, stock, accounting, refunds, FBR submission, loyalty, and gift vouchers.
- Keeps a local SQLite cache for offline item/customer/config lookup.
- Allows offline sales when local essentials are available.
- Queues offline sales and syncs them when ERPNext is online.
- Supports cashier login, local offline cashier PIN, settings PIN, and shift PIN.
- Supports POS Opening Entry, Close Shift, shift summary, held sales, sales history, duplicate receipts, refunds, loyalty, coupons, and gift vouchers.
- Prints receipts through Electron.
- Supports GitHub-based Windows installer releases and auto-update.

## Hard Rules

- Electron never calls FBR directly.
- ERPNext remains authoritative for final calculations.
- Offline mode is for sales only.
- Refunds are online-only.
- Close Shift is online-only.
- API key/secret are terminal background credentials, not cashier identity.
- Cashier password is never stored.
- Local PINs are stored only as salted hashes.

## Tech Stack

- Electron `33`
- TypeScript
- SQLite through `better-sqlite3`
- ERPNext / Frappe custom app: `aimatic`
- Electron Builder NSIS installer
- Electron Updater

## Main Files

```text
src/main.ts                  Electron main process, IPC, ERPNext calls, sync, printing, updater
src/preload.ts               Narrow secure bridge exposed to renderer
src/renderer/renderer.ts     POS UI workflows
src/renderer/index.html      POS screens and dialogs
src/renderer/styles.css      Renderer styling
src/db/database.ts           SQLite schema, cache, settings, history, queue
src/domain/fbr-calculation.ts Local FBR estimate engine only
docs/architecture.md         Full architecture notes
docs/offline-pos-rules.md    Offline sale rules
docs/fbr-refund-rules.md     Refund and FBR rules
```

## Required Server App

Server-side source of truth is the Frappe app:

```text
~/frappe-bench/apps/aimatic
```

Expected ERPNext methods include:

- `aimatic.offline_pos.api.pos_cashier_login`
- `aimatic.offline_pos.api.authorize_pos_admin_action`
- `aimatic.offline_pos.api.get_active_pos_session`
- `aimatic.offline_pos.api.start_pos_session`
- `aimatic.offline_pos.api.get_pos_closing_summary`
- `aimatic.offline_pos.api.close_pos_session`
- `aimatic.offline_pos.api.preview_cart`
- `aimatic.offline_pos.api.submit_online_sale`
- `aimatic.offline_pos.api.get_pos_invoice_for_refund`
- `aimatic.offline_pos.api.submit_pos_refund`
- `aimatic.offline_pos.api.get_pos_fbr_item_config`
- `aimatic.offline_pos.api.get_item_barcodes`
- `aimatic.offline_pos.api.get_uom_conversions`
- `aimatic.offline_pos.api.get_customer_benefits`
- `aimatic.gift_voucher.api.list_customer_gift_vouchers`
- `aimatic.gift_voucher.api.validate_gift_voucher_code`

## Install Dependencies

```powershell
cd D:\erpnext-offline-pos
npm install
```

## Run In Development

```powershell
npm run dev
```

## Run App

```powershell
npm start
```

## Build

```powershell
npm run build
```

## Create Installer

```powershell
npm run dist
```

Installer output:

```text
dist-installer/
```

## Release

Build installer and publish through the release script:

```powershell
npm run release
```

The release script reads GitHub token values from local `.env`.

Do not commit `.env`, credentials, API keys, tokens, database files, logs, or backups.

## Runtime Setup

The Settings screen needs:

- ERPNext URL
- API key
- API secret
- POS Profile
- Terminal ID
- Branch, when required by ERPNext accounting dimensions

Settings are protected by Settings PIN.

Shift start and close are protected by Shift PIN.

## Cashier Login

Online cashier login:

- Cashier enters ERPNext username/password.
- Server verifies roles and POS Profile access.
- App stores only runtime cashier identity.
- Password is cleared after login attempt.

Offline cashier login:

- Requires previous successful online login.
- Uses local Offline Cashier PIN.
- Allows offline sales only.
- Does not allow refund, close shift, settings, force sync, or customer creation.

## Offline Sale Flow

When ERPNext is unavailable:

- App uses local SQLite cache.
- App allows sale only if local config, payment methods, item prices, customer, cart, and payment are valid.
- App queues sale locally with same `terminal_invoice_id`.
- App prints offline receipt.
- FBR section shows pending/offline text.

When ERPNext returns:

- App creates or reuses a real POS Opening Entry.
- App assigns that real opening entry before submit.
- App syncs queued sales in order.
- App keeps `terminal_invoice_id` unchanged.
- User closes shift manually later.

## Receipt Rules

- Normal sale receipt uses ERPNext/server receipt when available.
- Offline receipt must keep the same receipt layout and only change FBR status text.
- Duplicate receipt must include `DUPLICATE COPY` inside the receipt body.
- Refund receipt must show `REFUND / RETURN`.

## Payment Rules

- Cart and receipt Grand Total show invoice total.
- Payment dialog collects payable amount.
- `amount_due` is the amount to collect after loyalty/gift voucher settlement.
- Do not add a client-side `Gift Voucher` payment row. ERPNext adds it server-side.

## Close Shift

- Close Shift is online-only.
- Expected amount per mode is opening plus sales minus refunds.
- Refund payment movement is negative.
- Held sales are deleted on successful shift closing.
- Shift summary is printed after close.

## Security

- Renderer has `nodeIntegration: false`.
- Renderer uses `contextIsolation: true`.
- Renderer cannot access SQLite or terminal API secret directly.
- Preload exposes only narrow IPC methods.
- API secret is hidden after save.
- Cashier password and supervisor password are never stored.
- Local PIN hashes use salted `scrypt`.

## Useful Commands

```powershell
npm run build
npm start
npm run dist
npm run release
git status
```

## More Docs

- [Architecture](docs/architecture.md)
- [Offline POS Rules](docs/offline-pos-rules.md)
- [FBR Refund Rules](docs/fbr-refund-rules.md)
