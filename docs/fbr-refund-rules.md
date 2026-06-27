# FBR And Refund Rules

Last updated: 2026-06-28

## Hard Rule

Electron must never call FBR directly.

FBR final submission happens only on ERPNext/Frappe server.

## Normal Sale

ERPNext remains authoritative for:

- Final item valuation
- Final taxes
- POS Invoice submission
- FBR payload
- FBR submission
- Accounting rows

Electron can show local estimates for offline operation, but final FBR outcome is server-side.

## Offline Sale

Offline sale is queued locally.

Offline receipt must clearly say:

- FBR Status: `Awaiting internet availability`
- FBR Invoice No: `Pending`
- FBR Response: `Will submit automatically when ERPNext is online`

Offline sale is not a final FBR invoice until server sync succeeds.

## Refund / Return

Refund remains online-only.

Refund must use ERPNext server endpoint:

```text
aimatic.offline_pos.api.submit_pos_refund
```

Electron sends refund request only to ERPNext.

ERPNext creates/submits the return POS Invoice and FBR credit note.

## Refund Authorization

Backend must enforce refund permission.

Current server rule:

- `POS Supervisor`, or
- `System Manager`

Optional future profile-level rule:

- POS Profile custom child table `custom_refund_allowed_users`

UI disable is helpful but not trusted. Server is final authority.

## Refund Quantity Rules

Refund quantity must be based on original submitted POS Invoice rows.

Server must prevent over-refund.

Client must refresh refundable quantities before submit.

If another refund already consumed the quantity:

- Refresh quantities.
- If fully refunded, show fully refunded state.
- Do not submit duplicate refund.

## FBR Refund Payload Rule

For FBR refund/credit note payload:

- Header `InvoiceType = 2`
- Item row `InvoiceType = 1`

Reason:

FBR rejected item-level `InvoiceType = 2` with:

```text
Invalid Invoice Type
```

## FBR POS Service Fee

FBR POS service fee is not refunded.

Refund receipt should show it as non-refundable.

## Duplicate Receipts

Duplicate print must not create invoice or submit FBR.

Duplicate label must be inside the actual receipt body:

```text
DUPLICATE COPY
```

It must not print as a separate thermal document before the receipt.
