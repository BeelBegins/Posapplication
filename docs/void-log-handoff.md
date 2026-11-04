# Void log — handoff

Status 2026-11-04, branch `claude/keen-einstein-3y522g`. **POS app half is done and tested (142 tests, browser-driven Voids tab). Server (`aimatic`) half is NOT built — the POS keeps every void saved on the till and retries until it exists.** Nothing here has been run on a real till or real ERP.

## Why
ERP only sees completed sales. A cashier could scan items, remove them and keep the money; before this, nothing recorded it. The server only logged supervisor *approvals* (`POS Admin Audit Log`: user, action, terminal, status) — no item, qty, amount, cashier or shift — and a cashier with `canVoidItems` voids with no approval and no record at all.

## What the POS now records
`line_void` (cart line removed, incl. quantity going to 0), `clear_cart`, `held_sale_deleted`. Each event: `eventId` (idempotency key), kind, createdAt, cashierUser/Name, posProfile, terminalId, hardwareId, openingEntry, customer, `authorizedBy` (`supervisor_prompt` | `cashier_privilege`), lines[{itemCode,itemName,uom,qty,rate,amount}], totalAmount (qty×rate before tax, an estimate), note.
- Code: `src/domain/void-log.ts` (pure), `src/core/void-log.ts` (store + sync), hooks in `renderer.ts` (`recordVoidEvent`), IPC `void-log:*`, Android via `mobile.ts`.
- Stored in `app_meta` key `void_log_v1`, capped at 5000, unsynced events never dropped, synced ones pruned after 90 days. Recording is local-first and never blocks the cart.
- Synced on each recorded void when online, and with every sale-queue sync (reconnect, Sync Now, before Close Shift).
- UI: Sales History → **Voids** tab (date range, search by cashier/item/customer, "waiting to send / sent to ERP"); shift summary print has "Voids this shift" (count + value, local log only).

## Server contract the POS already calls
`POST /api/method/aimatic.offline_pos.api.log_pos_voids` with form/JSON `pos_profile` and `events` = **JSON string** of a list of events (fields above, camelCase, without `syncedAt`/`attempts`).
Response must be `{"message": {"accepted": ["<eventId>", ...]}}`. Accepted = stored (or already stored). Anything not listed is retried. HTTP 404 = "not built yet" (POS shows a clear message and keeps the voids).

## Server work to do (repo `BeelBegins/aimatic`, branch `master`; needs write access)
1. **Doctype `POS Void Log`** (submittable not needed; no edit/delete for anyone but System Manager): `event_id` (Data, unique, reqd), `kind` (Select line_void/clear_cart/held_sale_deleted), `occurred_at` (Datetime), `cashier_user` (Link User), `cashier_name`, `pos_profile` (Link), `terminal_id`, `hardware_id`, `pos_opening_entry` (Data — may be blank/offline batch, don't Link), `customer`, `authorized_by` (Select), `total_amount` (Currency), `lines_json` (Long Text) **plus child table `POS Void Log Item`** (item_code, item_name, uom, qty, rate, amount) so reports can group by item. Add `branch`/`company` fetched from the POS Profile for dashboard filtering.
2. **Endpoint** `log_pos_voids(pos_profile, events)` in `aimatic/offline_pos/api.py`, same guards as other POS endpoints (`_require_login`, `require_active_device(hardware_id)` per event). Sketch:
```python
@frappe.whitelist()
def log_pos_voids(pos_profile, events):
    _require_login()
    accepted = []
    for ev in json.loads(events):
        if frappe.db.exists("POS Void Log", {"event_id": ev["eventId"]}):
            accepted.append(ev["eventId"]); continue
        doc = frappe.get_doc({"doctype": "POS Void Log", "event_id": ev["eventId"], "kind": ev["kind"],
            "occurred_at": get_datetime(ev["createdAt"]), "cashier_user": ev["cashierUser"], "pos_profile": pos_profile,
            "terminal_id": ev.get("terminalId"), "hardware_id": ev.get("hardwareId"), "pos_opening_entry": ev.get("openingEntry"),
            "customer": ev.get("customer"), "authorized_by": ev["authorizedBy"], "total_amount": flt(ev["totalAmount"]),
            "items": [{"item_code": l["itemCode"], "item_name": l["itemName"], "uom": l["uom"], "qty": l["qty"], "rate": l["rate"], "amount": l["amount"]} for l in ev["lines"]]})
        doc.insert(ignore_permissions=True)
        accepted.append(ev["eventId"])
    return {"accepted": accepted}
```
   Validate `kind`/`authorizedBy` against the allowed values, cap batch size (POS sends ≤50), and take `cashier_user` from the event only if it equals an existing user (the API user is the transport identity, not the cashier).
3. **Sales Dashboard Console** (`aimatic/aimatic/page/sales_dashboard_console/`): add "Void Details" — totals by branch/cashier/day, drill-down to the list with items, `authorized_by` highlighted (cashier_privilege voids are the ones to watch). Reuse its existing data-fetch pattern.
4. Optional: add `void_count`/`void_amount` to the server shift summary so the printed summary does not depend on the till's local log.
5. Optional: record `item`, `qty`, `amount` in `POS Admin Audit Log` for `void_item`/`clear_cart` — not needed once `POS Void Log` exists.

## To verify after the server exists
1. Void a line online → row appears in `POS Void Log` and Voids tab shows "sent to ERP".
2. Go offline, void, Clear Cart, delete a held sale → all show "waiting to send"; reconnect → they sync once (no duplicates after a second sync).
3. Cashier with and without `canVoidItems`: `authorized_by` is right in both.
4. Dashboard totals match the Voids tab for a shift; shift summary print shows the same count.

## Known limits
- Quantity *reductions* that stay above 0 (e.g. 5 → 2) are not logged; only whole-line removal. Say if you want them.
- Which supervisor approved a void is not recorded yet (the POS only knows an approval happened); needs `authorize_pos_admin_action` to return the approving user.
- No "reason" prompt (not requested). Value is qty × selling price before tax.
- A cart abandoned by logging out / closing the app is not logged.
