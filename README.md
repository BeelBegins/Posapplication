# Ai Matic POS App

Windows desktop POS for ERPNext retail stores.

Built with Electron, TypeScript, SQLite, ERPNext/Frappe APIs, and FBR-ready server integration.

## Current Version

```text
2.6.7
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
- Supports combined GitHub releases containing the Windows installer, focused POS/Sales/Shopping Android APKs, and Shopping web bundle.
- Supports GitHub-based Windows auto-update.

## Hard Rules

- Electron never calls FBR directly.
- ERPNext remains authoritative for final calculations.
- Offline mode is for sales only.
- Refunds are online-only.
- Close Shift is online-only.
- Electron API key/secret are terminal background credentials, not cashier identity.
- Android POS never accepts API key/secret; it uses device enrollment and per-cashier OAuth2 PKCE.
- Cashier password is never stored.
- Local PINs are stored only as salted hashes.

## Tech Stack

- Electron `33`
- TypeScript
- SQLite through `better-sqlite3`
- ERPNext / Frappe custom app: `aimatic`
- Electron Builder NSIS installer
- Electron Updater

## Product Profiles

The repository defines focused Ai Matic POS, Restaurant, Sales, and Shopping profiles. POS, Sales, and Shopping are independently buildable and released; Restaurant remains deferred and is not published. Electron remains POS-only, and each Android product has a distinct application ID and storage namespace.

See [Product Architecture](docs/product-architecture.md), [Build Profiles](docs/build-profiles.md), [API Contracts](docs/api-contracts.md), and [Android device and cashier authentication](docs/android-authentication.md).

## Main Files

```text
src/main.ts                  Electron main process, IPC, ERPNext calls, sync, printing, updater
src/preload.ts               Narrow secure bridge exposed to renderer
src/renderer/renderer.ts     POS UI workflows
src/renderer/index.html      POS screens and dialogs
src/renderer/styles.css      Renderer styling
src/products/shared/ui.ts    Safe shared status, empty/loading, money, and bottom-navigation UI helpers
src/products/sales/          Focused mobile Sales ordering UX and domain
src/products/shopping/       Focused customer Shopping catalogue, cart, checkout, and tracking UX
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

## Create Android APK

The Android shell uses the same platform-neutral ERPNext business logic while keeping Electron desktop behavior isolated. Android POS requires one-time device enrollment and OAuth2 PKCE cashier login; it has no API Key/API Secret setup fields. JDK 21 and Android SDK 36 are required.

```bash
npm run android:pos:apk
```

APK output:

```text
dist-apk/Aimatic-POS-App-<version>-debug.apk
```

The Android products launch in sensor-aware portrait mode. POS uses an Android-only touch layout with compact status, readable cart cards, and pinned payment actions; Electron retains its existing desktop layout. Android uses application storage for its existing offline data, Android Keystore-backed encrypted storage for enrollment/session material, and the Android print service. The synced catalogue is persisted separately from small operational/cart state and indexed in memory so barcode scans do not rewrite or linearly rescan the entire catalogue. Existing data migrates automatically. Electron-only auto-update and second-monitor controls are not loaded on Android.

## Create a Google Play App Bundle

Google Play requires a signed Android App Bundle for a new app. Configure the same permanent Android signing key used by CI, then build the required product:

```bash
export ANDROID_KEYSTORE_PATH=/secure/path/aimatic-release.jks
export ANDROID_KEYSTORE_PASSWORD='your-store-password'
export ANDROID_KEY_ALIAS='your-key-alias'
export ANDROID_KEY_PASSWORD='your-key-password'
npm run android:pos:aab
npm run android:sales:aab
npm run android:shopping:aab
```

Signed bundles are written to `dist-aab/`. Keep the keystore and passwords outside the repository and retain them permanently as the Google Play upload key. Restaurant has an Android build profile but must not be submitted to production while its demo-backed behavior remains enabled.


## Release

Pushes to `main` run the combined release workflow. It tests the application, builds Windows plus POS, Sales, and Shopping Android independently, builds the Shopping web bundle, and publishes them to the same `v<package version>` GitHub release:

```text
Aimatic-POS-App-Setup-<version>.exe
Aimatic-POS-App-<version>.apk
Aimatic-Sales-App-<version>.apk
Aimatic-Shopping-App-<version>.apk
Aimatic-Shopping-Web-<version>.zip
latest.yml
```

The repository must define these GitHub Actions secrets for stable Android signing:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Create the keystore once and keep it permanently; changing it prevents Android from installing future APKs as updates. Encode it for the GitHub secret with:

```bash
base64 -w 0 aimatic-release.jks
```

The existing local Windows-only release command remains available:

```powershell
npm run release
```

The local release script reads GitHub token values from `.env`. If a correctly named signed APK exists under `dist-apk/`, it is attached too; CI requires it through `--require-apk`.

Do not commit `.env`, credentials, API keys, tokens, database files, logs, or backups.

## Runtime Setup

Electron Settings needs:

- ERPNext URL
- API key
- API secret
- POS Profile
- Terminal ID
- Branch, when required by ERPNext accounting dimensions

Settings are protected by Settings PIN.

Android POS instead needs an HTTPS ERPNext URL and a one-time enrollment QR generated by a POS Supervisor or System Manager. The enrollment screen scans the QR with the Android camera or accepts a pasted value as fallback. Device configuration and OAuth tokens are stored using Android Keystore-backed encrypted storage.

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
