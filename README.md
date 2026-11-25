# Ai Matic POS App

Shared TypeScript client for Ai Matic retail products backed by the `aimatic`
Frappe/ERPNext app.

| Product | Platforms | Notes |
| --- | --- | --- |
| **POS** | Windows (Electron), Android | Online-first retail terminal with offline sale queue |
| **Sales** | Android | Mobile order-taking (OAuth PKCE) |
| **Shopping** | Android, web PWA | Customer catalogue / COD / store pickup |
| **Restaurant** | Android | Waiter shell (published APK; demo paths must not go to Play production) |

Current package version is in [`package.json`](package.json) (today **3.0.22**).
Every push to `main` builds and publishes all products to a GitHub Release
`v<version>` — bump that version before release pushes.

## Downloads

GitHub Releases: https://github.com/BeelBegins/Posapplication/releases

Typical assets per tag:

- `Aimatic-POS-App-Setup-<version>.exe` — Windows POS (auto-update via `latest.yml`)
- `Aimatic-POS-App-<version>.apk`
- `Aimatic-Restaurant-App-<version>.apk`
- `Aimatic-Sales-App-<version>.apk`
- `Aimatic-Shopping-App-<version>.apk`
- `Aimatic-Shopping-Web-<version>.zip`

## Hard rules

- ERPNext/`aimatic` is the source of truth for pricing, stock, GL, FBR, loyalty,
  and gift vouchers. The Electron client never calls FBR directly.
- Offline is for **sales queue only**. Refunds and Close Shift stay online-only.
- Electron API key/secret = terminal transport identity, not the cashier.
- Android POS uses device enrollment + cashier OAuth2 PKCE (no API key UI).
- Never commit `.env`, keystores, tokens, or credentials.

## Develop

```bash
npm install
npm run build
npm test
npm run dev          # Electron POS watch + run
```

Android / web product builds use `npm run android:<product>:apk`,
`android:<product>:aab`, and `build:shopping:web` — see
[`docs/build-profiles.md`](docs/build-profiles.md).

## Server

Companion app: `~/frappe-bench/apps/aimatic` (repo `BeelBegins/aimatic`).

POS terminals call allowlisted `aimatic.offline_pos.api.*` (and gift-voucher /
product-specific) methods — not broad Desk DocPerm as the primary contract.

## Docs

- [Architecture](docs/architecture.md)
- [Product architecture](docs/product-architecture.md)
- [Build profiles](docs/build-profiles.md)
- [Offline POS rules](docs/offline-pos-rules.md)
- [FBR / refund rules](docs/fbr-refund-rules.md)
- [Android authentication](docs/android-authentication.md)
- [API contracts](docs/api-contracts.md)

## Offline gift vouchers

The matching ERP update supplies signed Gift Voucher Criteria. Tills receive scoped rule-change notifications and conditionally fetch updated rules. The existing server-health request also carries a revision token to recover missed notifications without another poll. Startup, focus/reconnect and manual POS Configuration refresh check the revision; unchanged rules cause no snapshot writes. The configuration screen shows the last successful voucher sync. Initial sync is required before offline receipts can include vouchers; an unsynced counter warns without blocking sales.

Eligible offline receipts include the voucher code, amount, expiry and minimum next purchase. The durable queued sale retains the exact code and signed terms across restarts and rule changes. ERP verifies the claim when it receives the sale; redemption remains online and becomes available after the issuing sale syncs. Rule changes made during an outage reach the till when it reconnects. A voucher amount discrepancy remains queued for supervisor review while later sales can sync.

This feature requires the matching Aimatic backend and `Gift Voucher.issuance_snapshot` schema update. Keep feature work off `main` until the coordinated release is approved.
