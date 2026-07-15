# Phase 3: Ai Matic Sales

Ai Matic Sales is a focused Capacitor application for employees with Sales User, Sales Manager, or System Manager. It does not contain Retail POS, Restaurant, Shopping, purchasing, accounting, or administrative screens.

## Implemented flow

ERPNext OAuth2 PKCE login → allowed branch → customer search → outstanding balance, credit limit, and customer price list → item search or camera barcode scan → branch warehouse availability → offline draft/cart → ERPNext order preview → draft Sales Order creation → order history/status.

The focused mobile navigation is Customers → Order → Drafts → Orders → Profile. Customer and item search are debounced, recent selections remain on-device, category chips and camera scanning reduce typing, and the review screen keeps stock, credit, tax, total, draft, and submission state visible. The responsive shell uses portrait-safe areas, 48px primary controls, a persistent cart dock, and one-column phone layouts without importing Electron behavior.

The client stores drafts and queued submissions under the Sales application sandbox. Every draft receives one stable `request_id`; retries reuse it. The server's `Mobile Sales Order Request` record maps that ID to at most one Sales Order, preventing repeat taps or queue replays from creating duplicates.

Local states are deliberately explicit: draft, queued, failed, and submitted. Queued/failed cards show their stable request ID and a safe retry action; server history separately exposes Draft, Submitted, Partially Delivered, Completed, and Cancelled filters. A locally displayed estimate is not presented as an ERPNext-confirmed total until preview succeeds.

## Server authority

All mobile calls use the restricted `aimatic.mobile_sales.api` namespace. The server:

- requires a logged-in Sales role and normal ERPNext document permissions;
- derives the ordinary salesperson from the OAuth session;
- restricts non-manager users to their assigned Branch;
- derives company, finished-goods warehouse, and branch/customer Price List;
- reads outstanding balance and credit limit from ERPNext;
- returns warehouse stock without allowing the client to alter it;
- builds the Sales Order with ERPNext item/pricing/tax methods and document hooks;
- inserts the Sales Order through normal permissions and leaves it as a draft;
- never accepts a client rate, available quantity, outstanding amount, credit limit, company, or warehouse as authority.

The credit indicator is a warning. It never suppresses or bypasses ERPNext credit validation.

## Authentication and offline boundary

The APK contains no API key or API secret. It uses a separate public `Aimatic Sales Android` OAuth client with Authorization Code + PKCE, individual employee permissions, encrypted native token storage, refresh rotation, and no fallback to POS credentials.

Offline drafts can be edited and retained without a connection. A queued create is sent only when online. Final pricing, stock policy, credit rules, and document creation always require ERPNext.

## Release checks

- Run `npm test` and `npm run build`.
- Run `npm run android:sales:apk`.
- Verify POS Android and Electron builds remain unchanged.
- On a Sales User test account, verify assigned-branch enforcement, customer permissions, customer-specific price list, stock display, credit warning, draft creation, duplicate replay, queue sync, and order history.
- Verify a user without a Sales role and a Sales User attempting another branch are rejected.
