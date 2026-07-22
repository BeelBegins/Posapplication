# Phase 3: Ai Matic Sales

Ai Matic Sales is a focused Capacitor application for employees with Sales User, Sales Manager, or System Manager. It does not contain Retail POS, Restaurant, Shopping, purchasing, accounting, or administrative screens.

## Implemented flow

ERPNext OAuth2 PKCE login → ERPNext Company/Warehouse context (optional Ai Matic Branch) → customer search → outstanding balance, credit limit, and customer price list → item search or camera barcode scan → warehouse availability → offline draft/cart → ERPNext order preview → draft Sales Order creation → order history/status.

The focused mobile navigation is Customers → Order → My Orders → Profile; My Orders merges on-device drafts/queue states and ERPNext order history into one pipeline. Customer and item search are debounced, stale search responses are ignored, and item search covers code, name, category, and brand. Category and brand chips, the last ten explicit searches, platform voice input, recent selections, and camera scanning reduce typing; voice search falls back to the same keyboard field when platform speech recognition is unavailable.

The Order screen provides two persistent catalogue modes. **Fast Order** is the default high-volume list: every row keeps item identity, brand/SKU, UOM-specific availability, assigned-UOM selector, direct quantity/plus-minus controls, and live line estimate in one scan path; a visible row control expands conversion and order details. **Cards** preserves the visual browse-and-add layout. Switching modes preserves the same draft and cart. In both modes alternate UOMs appear only when assigned to the Item with a positive conversion factor, each option shows its stock-UOM conversion, and prices/availability come from the server response. A sticky ambient status strip reports online contact, local queued/failed/syncing state, and opens Profile for details without adding a sync API.

The Customers screen also presents up to three permission-filtered submitted orders from distinct recent customers. **Order Again** creates a new local draft and a new stable request ID, preserving quantities and assigned UOMs only as a starting point. When online, it reloads customer context and revalidates every item and UOM against the selected warehouse before review; unavailable items are omitted and obsolete UOMs fall back to a currently valid Item UOM. A cached reorder may seed an offline draft, but it is labeled cached and cannot receive authoritative totals or create the Sales Order until ERPNext is available. After creation, the confirmation exposes Share, Copy number, and View order actions while explicitly stating that ERPNext created a Draft awaiting submission.

Draft parsing is cached and queue synchronization runs after the first usable screen is shown. The responsive shell uses portrait-safe areas, 48px primary controls, a persistent cart dock, and one-column phone layouts without importing Electron behavior.

When ERPNext has multiple permitted warehouses and no user/global default, initial context loading remains successful and the Customers screen requires an explicit warehouse selection. The server never guesses between warehouses, and customer pricing/stock calls remain blocked until the selection is made.

The client stores drafts and queued submissions under the Sales application sandbox. Every draft receives one stable `request_id`; retries reuse it. The server's `Mobile Sales Order Request` record maps that ID to at most one Sales Order, preventing repeat taps or queue replays from creating duplicates.

Local states are deliberately explicit: draft, queued, failed, and submitted. Queued/failed cards show their stable request ID and a safe retry action; server history separately exposes Draft, Submitted, Partially Delivered, Completed, and Cancelled filters. A locally displayed estimate is not presented as an ERPNext-confirmed total until preview succeeds.

## Server authority

All mobile calls use the restricted `aimatic.mobile_sales.api` namespace. The server:

- requires a logged-in Sales role and normal ERPNext document permissions;
- derives the ordinary salesperson from the OAuth session;
- uses standard ERPNext user/global Company, Warehouse, Stock Settings, and Selling Settings defaults first;
- allows a company with no Branch records to use normal ERPNext Company/Warehouse behavior;
- restricts non-manager users to their assigned Branch when Ai Matic Branch management is configured;
- falls back to Branch warehouse/Price List settings only where standard ERPNext defaults are absent;
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
- On a standard ERPNext company with no Branch records, verify Company/Warehouse defaults, customer permissions, customer-specific price list, stock display, credit warning, draft creation, duplicate replay, queue sync, and order history.
- On a Branch-managed company, verify assigned-branch enforcement and Branch fallback defaults.
- Verify a user without a Sales role and a Sales User attempting another branch are rejected.
