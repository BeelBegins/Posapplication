# Ai Matic Restaurant — Phase 2 Contract

## Prototype status

The Restaurant Capacitor profile contains a complete touch-first waiter UX prototype backed only by `src/products/restaurant/mock-data.ts` and namespaced local storage. It is intentionally usable without Restaurant doctypes so the full table, menu, modifier, order, kitchen progress, bill, activity, offline, and failure-state flow can be reviewed before server integration. It imports neither the Restaurant API facade nor Electron code and performs no ERPNext writes. Replace the mock repository with the contract below when the required doctypes and permission-enforcing endpoints are implemented.

## Product boundary

Restaurant is a separate Capacitor product. It does not render Retail POS screens and does not import Electron IPC, desktop printing, updater, customer display, or filesystem code.

ERPNext remains authoritative for user permissions, POS Profile access, price lists, item eligibility, taxes, stock, POS Invoices, and accounting. The Restaurant Order and Kitchen Ticket are operational Ai Matic documents; they do not post accounting entries.

## Required Ai Matic doctypes

- Restaurant Floor: branch, title, display order, disabled.
- Restaurant Table: branch, floor, title, capacity, disabled.
- Restaurant Order: branch, floor, table, waiter, guests, status, customer, POS Profile, totals, linked submitted POS Invoice.
- Restaurant Order Item: item, UOM, quantity, sent quantity, authoritative rate, notes, modifiers snapshot.
- Restaurant Kitchen Ticket: restaurant order, table, waiter, request ID, status, sent time.
- Restaurant Kitchen Ticket Item: source order row, item, quantity, notes, modifiers snapshot.
- Restaurant Modifier Group and Modifier Option: configuration linked to applicable menu items.

Floor/table availability is derived from active Restaurant Orders. A table is not marked open by trusting a client-provided status.

## API contract

All methods live under `aimatic.restaurant.api`, require an authenticated user, and enforce server roles, branch permission, POS Profile assignment, and document permission.

- `get_restaurant_bootstrap(branch)` returns permitted branches, floors, tables, menu categories, sellable menu items, modifiers, and active-table summaries.
- `get_table_order(table)` returns the active order only when the current user may access its branch.
- `open_order(branch, floor, table, guest_count)` atomically returns the existing active order or creates one. It prevents two open orders for one table.
- `save_order(order, items)` prices through ERPNext and changes only unsent rows. Sent KOT quantities are immutable.
- `send_to_kitchen(order, request_id)` creates one KOT for newly added quantities. `request_id` is unique and makes retries idempotent.
- `request_bill(order)` succeeds only when the order is non-empty and all quantities have been sent.
- `close_table(order, pos_invoice)` verifies the POS Invoice exists, is submitted, belongs to the same company/branch/customer, and represents the Restaurant Order before closing it.

The authenticated session user is the waiter identity. The API does not trust a client-provided waiter username.

## Status transitions

```text
Open → Sent to Kitchen → Bill Requested → Closed
  ↘       ↘
    Cancelled (only under explicit server authorization)
```

KOT status is independent: Queued → Preparing → Ready → Served. Cancelling already-sent food requires an explicit server-side void workflow and audit record; editing the original sent row is not allowed.

## Offline rule

Local drafts may add items and notes when offline. Sending to kitchen, requesting a bill, closing a table, merging tables, and splitting tables require authoritative server confirmation. A queued KOT request retains its unique request ID and may be retried safely after authentication/network recovery.

## Deferred scope

Split/merge tables is represented in the model but remains deferred as requested. It must later use an atomic server transaction and preserve KOT/order audit history.
