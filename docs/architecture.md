# Aimatic POS App Architecture

Last updated: 2026-07-06

## Purpose

Aimatic POS App is a Windows desktop POS terminal for ERPNext retail stores.

It is online-first, but it supports offline sales through a local SQLite cache and a durable local sale queue.

ERPNext and the `aimatic` Frappe app remain the server-side source of truth.

## Product Scope

Implemented client responsibilities:

- Desktop cashier workflow.
- Terminal setup and protected settings.
- Cashier login and offline cashier PIN.
- POS Profile and terminal context.
- Start Shift and Close Shift.
- Item search, barcode scan, UOM barcode support, and cart management.
- Local cart and payment draft persistence.
- Server cart preview.
- FBR estimate preview from cached FBR config.
- Online sale submit.
- Offline sale queue and reconnect sync.
- Receipt preview, print, duplicate print, and receipt cache.
- Held sales.
- Sales history.
- Refund workflow.
- Loyalty, coupons, and gift voucher UI.
- Shift summary and shift history.
- GitHub release and auto-update UI.

Out of client scope:

- Final tax calculation.
- Final stock validation.
- Final accounting.
- POS Invoice submission authority.
- FBR final payload submission.
- Refund authority.
- Gift voucher redemption authority.
- Loyalty redemption authority.

## Source Of Truth

ERPNext is authoritative for:

- Final invoice calculations.
- Stock.
- Accounting.
- POS Invoice submission.
- Refund / return submission.
- FBR final submission.
- POS Opening Entry.
- POS Closing Entry.
- Loyalty redemption.
- Coupon validation.
- Gift voucher validation and redemption.
- User, cashier, role, and POS Profile permissions.

Electron is authoritative only for:

- Local UI state.
- Local cache state.
- Local offline queue state before sync.
- Local draft cart, payments, benefits, and held-sale records.
- Local receipt print action.
- Local PIN hash verification.

Electron must never call FBR directly.

## Repositories

Client repository:

```text
BeelBegins/Posapplication
D:\erpnext-offline-pos
```

Server repository:

```text
BeelBegins/aimatic
~/frappe-bench/apps/aimatic
```

Server development branch:

```text
fbr-pos-integration
```

## Runtime Architecture

```text
Renderer UI
  -> preload bridge
    -> Electron main IPC handlers
      -> SQLite cache
      -> ERPNext/Frappe API calls
      -> Electron print/update APIs
```

The renderer never talks to Node, SQLite, files, terminal API secret, or ERPNext directly.

## Main Components

### `src/main.ts`

Owns:

- Electron app bootstrap.
- BrowserWindow creation.
- Secure webPreferences.
- IPC handler registration.
- ERPNext API calls.
- Cashier authentication calls.
- Admin/supervisor authorization calls.
- POS Profile sync.
- POS session sync.
- Start Shift and Close Shift calls.
- Item/customer/FBR sync.
- Online sale submit.
- Offline queue sync.
- Receipt fetch, duplicate receipt fetch, and print.
- Refund API calls.
- Auto-update and release install actions.

Important security settings:

```text
contextIsolation: true
nodeIntegration: false
```

### `src/preload.ts`

Owns the renderer bridge.

It exposes `window.posAPI` only.

The bridge includes methods for:

- settings
- cashier login
- admin PIN
- sync
- catalog
- customers
- cart preview
- payments
- sale submit and queue
- receipts
- held sales
- sales history
- refunds
- shift summary and close shift
- updates

Do not expose broad filesystem, database, shell, or credential access here.

### `src/renderer/renderer.ts`

Owns:

- Screen routing.
- Startup bootstrap.
- Cashier login screen.
- Settings screen.
- Start Shift screen.
- POS screen.
- Cart operations.
- Payment dialog.
- Benefits dialog.
- Receipt dialog.
- Held sales.
- Sales history.
- Refund screen.
- Close Shift screen.
- Shift history.
- Sync and update UI.
- Keyboard shortcuts.

Important shortcuts:

- F6: payment flow.
- F7: benefits.
- F9: complete sale and print.

### `src/db/database.ts`

Owns SQLite schema and persistence.

Local tables include:

- `app_meta`
- `app_settings`
- `pos_profile_cache`
- `pos_bootstrap_cache`
- `pos_session_cache`
- `pos_items`
- `pos_item_prices`
- `pos_item_stock`
- `pos_item_barcodes`
- `pos_item_uom_conversions`
- `pos_fbr_item_config`
- `fbr_sync_state`
- `catalog_sync_state`
- `pos_cart_state`
- `pos_payment_draft`
- `pos_benefits_draft`
- `pos_sales_history`
- `pos_receipt_cache`
- `pos_customers`
- `pos_customer_cache`
- `customer_sync_state`
- `held_sales`
- `pos_shift_history`
- `pos_refund_log`

Database schema is versioned through local migrations.

### `src/domain/fbr-calculation.ts`

Owns local FBR estimate logic only.

This is not final FBR submission logic.

Server remains authoritative.

## ERPNext API Contract

Terminal API key/secret authenticate background calls.

Cashier identity is separate and is verified by server endpoint.

Required server endpoints:

- `frappe.auth.get_logged_user`
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

## Startup Flow

1. Initialize Electron.
2. Initialize SQLite.
3. Load settings.
4. Test server/API credentials when possible.
5. Load cached POS configuration.
6. Show Settings if setup is incomplete.
7. Show Cashier Login if setup exists.
8. After cashier login, validate active POS session.
9. If active shift exists, open POS.
10. If no active shift exists, show Start Shift.

Cold offline start:

- Settings and local cache are required.
- Cashier must use previously configured Offline Cashier PIN.
- App cannot verify ERPNext password offline.

## Settings And URL Handling

ERPNext URL is normalized before save/use:

- Trim spaces.
- Remove invisible characters.
- Remove trailing slashes.
- Preserve `https://`.
- Default bare domain to `https://`.

Packaged production should require HTTPS for supervisor authorization.

Development may use relaxed rules only when explicit development bypass exists.

## Authentication Model

There are three identities:

- Terminal API user.
- Cashier user.
- Supervisor/admin authorizer.

Terminal API user:

- Stored as API key/secret.
- Used for background ERPNext calls.
- Never displayed as cashier.

Cashier user:

- Verified online through ERPNext.
- Stored in runtime session only.
- Cached for offline sale permission with local PIN.
- Password is never stored.

Supervisor/admin authorizer:

- Used only to authorize protected local PIN setup/reset.
- Password is never stored.
- Server returns short-lived authorization result/token.

## Local PIN Scopes

Settings PIN protects:

- Settings.
- API credential changes.
- Advanced diagnostics.
- Force sync.
- Update token configuration.

Shift PIN protects:

- Start Shift.
- Close Shift.

Offline Cashier PIN protects:

- Offline cashier login for sales.

PIN rules:

- Store only salted `scrypt` hash.
- Never store raw PIN.
- Never expose hash to renderer.
- Add delay and lockout after repeated failures.
- Cashier PIN is scoped to cashier, terminal, and POS Profile.
- Settings PIN must not act as cashier identity.
- Cashier PIN must not unlock settings.

## Cashier Login Flow

Online:

1. Cashier enters ERPNext username/password.
2. Electron calls `pos_cashier_login` using terminal API credentials.
3. Server verifies password, user enabled state, roles, and POS Profile access.
4. Electron stores runtime cashier identity.
5. If local offline PIN is missing and `can_offline_sale` is true, cashier can create PIN.
6. Password field is cleared.

Offline:

1. Cashier enters username and Offline Cashier PIN.
2. Electron verifies local salted hash in main process.
3. Cached offline login must not be expired.
4. Cached permissions must include `can_offline_sale`.
5. Only offline sales are allowed.

Offline login does not allow:

- Refund.
- Close Shift.
- Settings.
- Force sync.
- Customer creation.
- FBR final submission.

## POS Session And Shift Rules

Online sale requires a valid ERPNext POS Opening Entry.

When online:

- No active shift blocks sale.
- Closed shift blocks sale.
- Shift belonging to another cashier blocks sale.
- Shift with wrong POS Profile blocks sale.
- Previous-date shift blocks new sale until closed.

When offline:

- Do not call `validateSession()` before F9.
- Do not require live POS Opening Entry.
- Show `Offline Session - Sales Queued`.

## Offline Sale Queue

Offline sale is allowed only when local essentials exist:

- Cached POS configuration.
- Cached payment methods.
- Local item and price data.
- Customer/default customer.
- Non-empty cart.
- Valid item prices.
- Complete prepared payment.
- Cashier offline login is valid.

Offline queued sale stores:

- `terminal_invoice_id`
- `terminal_id`
- `pos_profile`
- `cashier_user`
- `cashier_full_name`
- `local_offline_session_id`
- `opening_entry` blank/null until sync
- `offline_authenticated`
- `offline_auth_method`
- `created_at`
- `status = Queued`

Offline session ID format:

```text
OFFLINE-{terminalId}-{date}-{uuid}
```

`OFFLINE-*` is never sent to ERPNext as `opening_entry`.

## Reconnect Sync

When ERPNext is reachable:

1. Validate terminal API credentials.
2. Validate or refresh cashier permission when possible.
3. Create or reuse a real POS Opening Entry for the offline batch.
4. Replace queued payload `opening_entry` with the real ERPNext opening entry.
5. Submit queued sales in order.
6. Keep `terminal_invoice_id` unchanged.
7. Do not auto-close the shift.

If sync fails:

- Keep sale queued.
- Do not delete local record.
- Do not duplicate invoice.
- Show clear error.

If server rejects cashier during sync:

- Stop syncing that cashier's queued sales.
- Mark them for supervisor review when supported.
- Do not delete them.

## Cart And Pricing

Item search uses local SQLite cache.

Barcode scan supports:

- item barcode
- UOM barcode
- local search fallback

UOM conversion factor is loaded from ERPNext cache.

Server cart preview remains authoritative for final totals.

Local FBR estimate is used for offline display and pre-checks only.

## Benefits, Loyalty, Coupons, Gift Vouchers

Benefits are online-only.

`preview_cart` may receive:

- `coupon_code`
- `redeem_loyalty_points`
- `loyalty_points`
- `gift_voucher_code`

Preview response may include:

- `gift_voucher_amount`
- `gift_voucher_error`
- `amount_due`

Rules:

- Invoice Grand Total remains the receipt/history invoice total.
- `amount_due` is only the collectable customer payment amount.
- Payment rows must cover collectable payable amount.
- Do not add client-side `Gift Voucher` payment row.
- ERPNext appends gift voucher settlement server-side.
- Gift voucher is blocked offline.

## Payment Rules

Payment dialog uses payable amount.

Cart and receipt display invoice Grand Total.

Cash can exceed payable and create change.

Non-cash cannot exceed remaining payable.

Payment draft is invalidated when cart, customer, session, or benefits change.

F9 sale submit is blocked when:

- cart is empty
- cart is not server validated while online
- payment is incomplete
- payment draft is outdated
- session is invalid while online
- required terminal/profile/customer data is missing

## Receipt Rules

Receipt rendering:

- Online sale uses server receipt when available.
- Offline sale uses same client receipt structure with offline FBR text.
- Duplicate receipt uses server/current receipt body with duplicate marker inside the body.
- Refund receipt clearly shows `REFUND / RETURN`.

Offline FBR text:

```text
FBR Status: Awaiting internet availability
FBR Invoice No: Pending
FBR Response: Will submit automatically when ERPNext is online
QR: Pending
```

Print rules:

- Receipt controls are hidden during print.
- Thermal receipt width targets 80mm.
- QR size/readability must be preserved.

## Refund Workflow

Refund is online-only.

Client flow:

1. Load original invoice through ERPNext.
2. Display refundable item quantities.
3. Cashier chooses refund quantity and mode of payment.
4. Client re-fetches invoice before submit.
5. Client blocks if another refund consumed quantity.
6. Client submits to `submit_pos_refund`.
7. Server creates return POS Invoice and FBR credit note.
8. Client shows refund receipt.

Server must enforce:

- cashier permission
- POS Profile permission
- no over-refund
- FBR refund payload rules
- accounting correctness

FBR refund payload rule:

- Header `InvoiceType = 2`
- Item `InvoiceType = 1`

FBR POS service fee is not refunded.

## Close Shift And Reconciliation

Close Shift is online-only.

Before closing:

- Active session is validated.
- Offline sale queue is synced if possible.
- Shift summary is loaded from server.

Close Shift screen shows:

- opening amount
- sale payments
- refund payments
- net movement
- expected amount
- actual counted amount
- difference

Calculation rule:

```text
expected = opening + sale payments - refund payments
```

Refund payments are negative movement.

Client normalizes server summary rows so:

- `sale_amount`
- `refund_amount`
- `net_movement`
- `expected_amount`

stay consistent in the UI.

If the server summary returns only net `collected_amount`, the client supplements the sale/refund split from the local `pos_refund_log`. New refund log rows store `mode_of_payment`; older rows without mode are assigned to Cash for display fallback.

After successful close:

- ERPNext POS Closing Entry is created.
- Shift summary is printed.
- Held sales are deleted.
- Local shift history is saved.
- New sale is blocked until new shift is opened.

## Held Sales

Held sale stores:

- terminal invoice id
- cashier/profile/company/branch
- cart
- payment draft
- benefits draft
- totals snapshot
- validation snapshot

Held sales are local only.

Held sales are deleted when shift closes successfully.

## Sales History

Sales history is local SQLite-backed.

Rows include:

- terminal invoice id
- POS Invoice name
- status
- payload
- response
- created/submitted time
- reprint count

History should stay scoped for performance.

Search supports invoice/date filters.

Duplicate print increments local reprint count.

## Sync Model

Configuration sync:

- POS Profile
- company
- branch
- warehouse
- payment methods
- taxes
- default customer

Catalog sync:

- items
- prices
- stock
- barcodes
- UOM conversions

FBR sync:

- item FBR config
- tax category
- HS code
- third-schedule fields
- service fee

Customer sync:

- customer identity and search fields
- customer cache

Sync supports full and delta modes where server supports `modified_after`.

Background sync runs periodically and is skipped while transaction workflows are in progress.

## Auto Update And Release

Package:

```text
Aimatic-POS-App-Setup-${version}.exe
```

Build output:

```text
dist-installer/
```

Release provider:

```text
GitHub: BeelBegins/Posapplication
```

Scripts:

```text
npm run build
npm run dist
npm run dist:protected
npm run release
```

Auto-update:

- uses `electron-updater`
- manual check/download/install buttons
- private repo token stored in local app metadata
- downloaded update calls `quitAndInstall(false, true)`

## Security Rules

Renderer security:

- `nodeIntegration: false`
- `contextIsolation: true`
- no direct SQLite
- no direct API secret
- no direct filesystem
- no direct ERPNext calls

Credential rules:

- API secret hidden after save.
- `.env` is local only.
- never commit secrets.
- never log passwords or PINs.
- never store cashier password.
- never store supervisor password.
- never hardcode shared production passwords.

Server security:

- terminal API key/secret handles machine API calls
- cashier password is verified server-side
- cashier permissions are server-side
- refunds are server-side authoritative
- FBR is server-side only

## Build And Test

Local build:

```powershell
npm run build
```

Development:

```powershell
npm run dev
```

Installer:

```powershell
npm run dist
```

Release:

```powershell
npm run release
```

Minimum verification before release:

- `npm run build`
- normal online sale
- offline sale queue and sync
- receipt print
- duplicate receipt print
- refund
- close shift with refund payment
- cashier login online
- cashier login offline
- settings PIN
- shift PIN
- auto-update install flow

## Operational Boundaries

Do not change these in Electron without server alignment:

- tax calculation contract
- FBR payload contract
- refund payload contract
- POS Opening Entry ownership
- POS Closing Entry ownership
- payment reconciliation rules
- gift voucher settlement rules
- loyalty settlement rules

Do not send `OFFLINE-*` to ERPNext as `opening_entry`.

Do not allow offline refunds.

Do not close shift offline.

Do not create customers offline.

Do not let Settings PIN act as cashier identity.

Do not let terminal API user appear as cashier.
