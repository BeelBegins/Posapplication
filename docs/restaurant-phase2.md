# Ai Matic Restaurant — Phase 2 Contract

## Integration status

The Restaurant Capacitor profile contains a complete touch-first waiter UX with two explicit modes. Live mode uses OAuth PKCE and the restricted `aimatic.restaurant.api`; Explore Demo uses only `src/products/restaurant/mock-data.ts` and namespaced local storage. Demo data is never submitted to ERPNext. The Restaurant build imports no Electron code and remains isolated from POS, Sales and Shopping.

## Product boundary

Restaurant is a separate Capacitor product. It does not render Retail POS screens and does not import Electron IPC, desktop printing, updater, customer display, or filesystem code.

ERPNext remains authoritative for user permissions, POS Profile access, price lists, item eligibility, taxes, stock, POS Invoices, and accounting. The Restaurant Order and Kitchen Ticket are operational Ai Matic documents; they do not post accounting entries.

## Implemented Ai Matic doctypes

- Restaurant Floor: branch, title, display order, disabled.
- Restaurant Table: branch, floor, title, capacity, disabled.
- Restaurant Order: branch, floor, table, waiter, guests, status, customer, POS Profile, totals, linked submitted POS Invoice.
- Restaurant Order Item: item, UOM, quantity, sent quantity, authoritative rate, notes, modifiers snapshot.
- Restaurant Kitchen Ticket: restaurant order, table, waiter, request ID, status, sent time.
- Restaurant Kitchen Ticket Item: source order row, item, quantity, notes, modifiers snapshot.
- Restaurant Modifier Group and Modifier Option: configuration linked to applicable menu items.

Floor/table availability is derived from active Restaurant Orders. A table is not marked open by trusting a client-provided status.

## API contract

All methods live under `aimatic.restaurant.api`, require an authenticated waiter/manager/kitchen user as appropriate, and enforce branch, Restaurant Profile and POS Profile assignment on the server. Item eligibility, stock and price adjustments are never accepted as authoritative client values.

- `get_public_config()` exposes only the public Restaurant OAuth client metadata.
- `get_restaurant_bootstrap(branch, restaurant_profile)` returns permitted profiles, floors, tables, menu categories, sellable menu items, modifiers, ERPNext prices/stock, and active-table summaries.
- `get_table_order(table)` returns the active order only when the current user may access its branch.
- `open_order(branch, floor, table, guest_count)` atomically returns the existing active order or creates one. It prevents two open orders for one table.
- `save_order(order, items)` prices through ERPNext and changes only unsent rows. Sent KOT quantities are immutable.
- `send_to_kitchen(order, request_id)` creates one KOT for newly added quantities. `request_id` is unique and makes retries idempotent.
- `request_bill(order)` succeeds only when the order is non-empty and all quantities have been sent.
- `close_table(order, pos_invoice)` verifies the POS Invoice exists, is submitted, belongs to the same company/branch/customer, and represents the Restaurant Order before closing it.
- `get_orders(...)` and `get_activity(...)` return only permitted Restaurant operational records.

Live waiters can open tables, add/configure items, type quantities for unsent lines, send idempotent KOT requests and request a bill. Kitchen status transitions require a Kitchen User or Restaurant Manager. A submitted POS Invoice is still required to close a table.

The authenticated session user is the waiter identity. The API does not trust a client-provided waiter username.

## Status transitions

```text
Open → Sent to Kitchen → Bill Requested → Closed
  ↘       ↘
    Cancelled (only under explicit server authorization)
```

KOT status is independent: Queued → Preparing → Ready → Served. Cancelling already-sent food requires an explicit server-side void workflow and audit record; editing the original sent row is not allowed.

## Offline rule

The live client never pretends a mutation reached ERPNext while offline. Sending to kitchen, requesting a bill, closing a table, merging tables, and splitting tables require authoritative server confirmation. Durable offline mutation replay remains deferred; the demo-only queue is clearly isolated.

## Deferred scope

Split/merge tables, split billing, POS Invoice/payment creation, scanner integration and durable offline mutation replay remain deferred. They must later use atomic server transactions and preserve KOT/order audit history.
