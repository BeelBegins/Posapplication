# Offline POS Rules

Last updated: 2026-07-03

## Goal

Sales must continue when ERPNext is unavailable, if local cached data is enough.

Offline mode is for sales only.

First-time cashier login requires online ERPNext verification.

If ERPNext goes offline after cashier login, the runtime cashier session remains active for offline sales.

If the app starts cold while offline, cashier can login with a locally saved Offline Cashier PIN.

Offline Cashier PIN rules:

- Created or updated only after successful online ERPNext cashier login.
- ERPNext password is never stored.
- Only salted `scrypt` PIN hash is stored.
- PIN cache is scoped to terminal, POS Profile, and cashier user.
- PIN cache also stores `can_offline_sale`, `last_online_verified_at`, and `offline_login_expires_at`.
- Offline PIN login is blocked after `offline_login_expires_at`.
- Offline PIN login is blocked if `can_offline_sale` is not true.
- Wrong offline PIN attempts are delayed and locked after repeated failures.
- If no offline PIN exists for that cashier, offline sales stay blocked until online cashier login succeeds.

## Offline Sale Allowed When

ERPNext/server is offline or unreachable, and all local essentials exist:

- Cached POS configuration exists.
- Cached payment methods exist.
- Local item and price data exists.
- Customer/default customer exists.
- Cart is not empty.
- Item prices are available locally.
- Payment is complete and prepared.

Offline F9 / Complete Sale must not call `validateSession()`.

Offline payment must not require live POS Opening Entry validation.

## Offline Sale Blocked When

- No cached POS configuration.
- No payment methods.
- No local item/price data.
- No customer/default customer.
- Empty cart.
- Missing item price.
- Payment is invalid or incomplete.

## Online Sale Rules

When server is online:

- Active ERPNext POS Opening Entry is required.
- If ERPNext says no shift, closed shift, outdated shift, or wrong user/profile, block sale.
- Do not fake offline mode when ERPNext explicitly rejects the session while reachable.

If server drops during validation or submit:

- Treat as offline.
- Queue once with the same `terminal_invoice_id`.

## Offline Session ID

If no real opening entry exists while offline, Electron creates/uses:

```text
OFFLINE-{terminalId}-{date}-{uuid}
```

The same offline batch ID is reused for the terminal/date.

Queued sale payload stores:

- `terminal_invoice_id`
- `terminal_id`
- `pos_profile`
- `cashier_user`
- `cashier_full_name`
- `local_offline_session_id`
- `opening_entry` as offline placeholder until sync assigns a real one
- `offline_authenticated`
- `offline_auth_method`
- `created_at`
- `status = Queued`

## Offline Header Text

When offline and no live shift is shown:

```text
Offline Session - Sales Queued
```

Do not show `No active POS Opening Entry` as a blocker while offline.

## Offline Receipt Text

Offline receipt reuses the same structured receipt renderer/template path.

Only FBR section text changes:

- FBR Status: `Awaiting internet availability`
- FBR Invoice No: `Pending`
- FBR Response: `Will submit automatically when ERPNext is online`
- QR: `Pending`

Do not change item, tax, payment, total, or amount formatting for offline receipt.

## Reconnect Sync

When ERPNext is back online and queued sales exist:

1. Revalidate terminal API credentials.
2. Create or reuse one ERPNext POS Opening Entry for the offline batch.
3. Use zero opening balances unless a future workflow captures real balances.
4. Assign the real opening entry to all queued sales in the same offline batch.
5. Sync queued sales in order.
6. Keep `terminal_invoice_id` unchanged.
7. Do not auto-close the shift.
8. User closes shift manually later.

If server rejects a queued sale because the cashier is disabled or no longer allowed:

- Mark the sale `Needs Supervisor Review`.
- Stop syncing further sales.
- Do not delete the sale.

If sync fails:

- Keep sale queued.
- Show clear error.
- Do not duplicate invoices.
- Do not lose sales.

## Still Online-Only

- Refund
- Close Shift
- FBR final submission
- Customer creation
- Force sync/settings operations needing server
