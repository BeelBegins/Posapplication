# Phase 3: Ai Matic Sales

Ai Matic Sales is a focused Capacitor application for employees with Sales User, Sales Manager, or System Manager. It does not contain Retail POS, Restaurant, Shopping, purchasing, accounting, or administrative screens.

## Implemented flow

ERPNext OAuth2 PKCE login → ERPNext Company/Warehouse context (optional Ai Matic Branch) → customer search → outstanding balance, credit limit, and customer price list → item search or camera barcode scan → warehouse availability → offline draft/cart → ERPNext order preview → draft Sales Order creation → order history/status.

The focused mobile navigation is Customers → Order → My Orders → Visits → Profile; My Orders merges on-device drafts/queue states and ERPNext order history into one pipeline. Customer and item search are debounced, stale search responses are ignored, and item search covers code, name, category, and brand. Category and brand chips, the last ten explicit searches, platform voice input, recent selections, and camera scanning reduce typing; voice search falls back to the same keyboard field when platform speech recognition is unavailable.

The Order screen provides two persistent catalogue modes. **Fast Order** is the default high-volume list: every row keeps item identity, brand/SKU, UOM-specific availability, assigned-UOM selector, direct quantity/plus-minus controls, and live line estimate in one scan path; a visible row control expands conversion and order details. **Cards** preserves the visual browse-and-add layout. Switching modes preserves the same draft and cart. In both modes alternate UOMs appear only when assigned to the Item with a positive conversion factor, each option shows its stock-UOM conversion, and prices/availability come from the server response. A sticky ambient status strip reports online contact, local queued/failed/syncing state, and opens Profile for details without adding a sync API.

Fast Order also includes the first Phase 2 intelligence feature: when the selected customer bought an item on at least two permission-visible submitted Sales Orders during the last three months, the server returns last quantity, average quantity, frequency, trend, and last-order date in the Item's stock UOM. The row converts those values to the salesperson's currently selected valid UOM and offers an explicit Apply action. Suggestions are hidden offline, are never auto-applied, and remain subject to the same ERPNext stock, price, tax, credit, and document validation as manually entered quantities.

Customer assortments are configured in ERPNext through **Mobile Sales Assortment** rows. A Sales Manager or System Manager can allow an individual Item or an Item Group; group rules include descendant groups. When at least one enabled rule exists, the Order screen shows a customer-specific Products filter. Activating it sends `assortment_only` to the restricted item search API, which resolves the configured union before applying text, barcode, category, brand, permission, sales-item, and disabled-item filters. With no enabled rules the full permitted catalogue remains available. The rule summary and expanded group names are cached locally so the filter remains understandable offline, but the client does not treat the cache as pricing, stock, or transaction authority.

Customer delivery rules are configured through **Mobile Sales Delivery Location**. Each enabled rule maps one customer to an enabled ERPNext Address already linked to that customer, with an optional default, weekday schedule, receiving instructions, and minimum order value. The Order and Review screens select the default location, show the address and available-day chips, move an incompatible default date to the next allowed day, and show a non-blocking minimum-order warning. The selected location is part of the persisted draft and stable offline request payload; cached rules keep offline preparation usable. On preview, create, update, and retry, the restricted backend resolves the location again, rejects another customer's address or a disallowed weekday, and writes the standard Sales Order shipping address. No configured locations preserves ordinary ERPNext address behavior.

Discount authority is configured per employee through **Mobile Sales Discount Authority**. The Review screen shows the current user's server-provided limit, accepts a percentage, and requires a reason above that limit. The requested percentage and reason stay with the local draft and offline queue, but ERPNext recalculates the actual Sales Order; the client never supplies a discount amount or final total. Over-limit creation produces one auditable **Mobile Sales Discount Approval** record and leaves the Sales Order Draft blocked from submission. Sales Managers and System Managers see a permission-filtered approval queue in My Orders, can approve or reject with a required rejection comment, and both decisions update the standard ERPNext discount fields. Notification Log and a live Frappe event alert connected managers/requesters. A server `before_submit` hook prevents pending, rejected, or increased-above-approved discounts from bypassing the decision.

The Customers screen also presents up to three permission-filtered submitted orders from distinct recent customers. **Order Again** creates a new local draft and a new stable request ID, preserving quantities and assigned UOMs only as a starting point. When online, it reloads customer context and revalidates every item and UOM against the selected warehouse before review; unavailable items are omitted and obsolete UOMs fall back to a currently valid Item UOM. A cached reorder may seed an offline draft, but it is labeled cached and cannot receive authoritative totals or create the Sales Order until ERPNext is available. After creation, the confirmation exposes Share, Copy number, and View order actions while explicitly stating that ERPNext created a Draft awaiting submission.

My Orders deliberately separates four actions. **View** fetches the current ERPNext document and displays its items, totals, discount, PO reference, mobile notes, delivery, and approval information without changing anything. **Edit Draft** is available only when the server reports an editable ERPNext Draft; it snapshots any unrelated active local order before loading the server draft. **Exit edit without saving** abandons those local edit changes and restores that snapshot. **Cancel Order** is shown only when the backend reports `can_cancel`, requires explicit confirmation, and invokes normal ERPNext cancellation for a submitted order; it is never the same action as leaving edit mode. The app restores PO reference and notes during edit, and uses the backend-normalized Draft, Submitted, Partially Delivered, Completed, and Cancelled statuses for filters. Orders load independently from the manager approval queue, so an approval error cannot erase ordinary history.

An explicit Mobile Sales Discount Authority applies even when the employee also has Sales Manager or System Manager. An unconfigured manager retains the 100% manager fallback, while a configured lower limit can exercise the real pending-approval workflow. The manager panel remains visible with a clear empty state when nothing is awaiting approval.

ERPNext Pricing Rules and Promotional Schemes are surfaced as informational offer cards and item badges. The restricted API filters active selling rules by date, company, currency, warehouse, customer/customer group/territory, Item, Item Group descendants, and Brand. The client never calculates or applies a promotion: it names the qualifying rule and ERPNext remains responsible for free items, tier quantities, discounts, taxes, and the final preview.

**Visits** is a field route built from manager-created **Mobile Sales Visit** records. A representative sees only their own dated schedule, customer address, planned time, instructions, and visit recency. Route optimization is an explicit nearest-next ordering from the device's current position; it does not overwrite the manager's saved route. Check-in and completion each require precise device GPS, timestamp automatically, accept notes and up to three compressed photos, and use stable request IDs. Photos are verified as JPEG/PNG/WebP and stored as private ERPNext files. Offline visit operations queue in order and replay safely; a queued check-in can be followed by a queued completion without producing duplicate audit events.

New order creation requires a customer signature and device location on the Review screen. The PNG signature is size/type validated, saved as a private attachment to the Sales Order, and linked to one immutable **Mobile Sales Order Proof** record with salesperson, timestamp, coordinates, and accuracy. Signature and location remain in the same stable offline order payload, and changing the customer, items, UOM, quantity, delivery, discount, PO reference, notes, branch, or warehouse invalidates stale proof and requires a fresh acknowledgement. Existing Draft edits remain editable without falsely replacing the original proof.

Sales Managers and System Managers receive a role-gated dashboard in Profile. Week/month cards aggregate submitted ERPNext Sales Orders for the selected Company/Warehouse, compare revenue and order count with the preceding period, show average order and completed GPS visits, flag out-of-stock items/stale visits/pending discounts, and rank order owners. The client displays only server aggregates and cannot submit KPI values.

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
- resolves configured customer delivery locations, dates, and shipping addresses server-side;
- applies employee discount authority and manager decisions server-side and blocks undecided submission;
- filters promotion visibility while leaving actual promotion calculation to ERPNext;
- validates idempotent GPS visit events and private image attachments;
- stores immutable private signature/location proof against the created Sales Order;
- computes manager KPIs only from submitted, company-scoped ERPNext records;
- inserts the Sales Order through normal permissions and leaves it as a draft;
- never accepts a client rate, available quantity, outstanding amount, credit limit, company, or warehouse as authority.

The credit indicator is a warning. It never suppresses or bypasses ERPNext credit validation.

## Authentication and offline boundary

The APK contains no API key or API secret. It uses a separate public `Aimatic Sales Android` OAuth client with Authorization Code + PKCE, individual employee permissions, encrypted native token storage, refresh rotation, and no fallback to POS credentials.

Offline drafts can be edited and retained without a connection. A queued create is sent only when online. Final pricing, stock policy, credit rules, and document creation always require ERPNext.

## Release checks

- Run `bench migrate` on each target site when deploying the assortment, delivery-location, discount-authority, discount-approval, visit, and order-proof schemas.
- Run `npm test` and `npm run build`.
- Run `npm run android:sales:apk`.
- Verify POS Android and Electron builds remain unchanged.
- On a standard ERPNext company with no Branch records, verify Company/Warehouse defaults, customer permissions, customer-specific price list, stock display, credit warning, draft creation, duplicate replay, queue sync, and order history.
- On a Branch-managed company, verify assigned-branch enforcement and Branch fallback defaults.
- Verify a user without a Sales role and a Sales User attempting another branch are rejected.
- Verify active promotions appear but ERPNext preview remains the only final promotion/price authority.
- Verify visit check-in/completion online, offline replay, private photos, location denial, and duplicate request IDs.
- Verify order proof is required for new orders, invalidates after order changes, and creates one private immutable audit record.
- Verify manager dashboard role gating and Company/Warehouse scoping.
- Verify View is read-only, Draft edit preserves PO/notes, Exit restores the previous local draft, and submitted-order Cancel is separately permission gated.
- On a deliberate pilot only, `bench --site <site> execute aimatic.mobile_sales.demo_data.execute` may create isolated `AIMATIC Demo` action fixtures; never attach this command to install or migrate.
