# Deferred known-issue snapshot

Preserved from private agent memory on 2026-07-28. These issues were explicitly deferred, but their current reproduction status is unverified. Diagnose read-only before treating them as active.

---
name: project-posapplication-known-issues
description: "Deferred permission/shift-boundary bugs found while manually testing Posapplication v2.1.3, explicitly not fixed yet"
metadata:
  node_type: memory
  type: project
  originSessionId: 42145cd7-4192-474b-81bc-1b0a2256448e
---

Found while the user manually smoke-tested the `core-extraction` refactor (merged as v2.1.3, see [[project_posapplication_core_extraction]]) on Windows. User said explicitly to defer these ("we will manage these roles later") — do not act on them unless asked to revisit.

1. **A plain cashier (POS User role) can't start a shift/selling** — gets a "you don't have the right" message. Per `apps/aimatic/aimatic/offline_pos/api.py:418`, server-side `can_start_shift` is unconditionally `true` for anyone who passes cashier login (`POS User`/`POS Supervisor`/`System Manager` all qualify per `_ALLOWED_CASHIER_ROLES`) — so this is either a stricter client-side (Electron) gate than the server intends, or an unrelated ERPNext permission gap (e.g. missing Cost Center/Warehouse/Branch `User Permission` on that user) blocking the POS Opening Entry itself, not an actual role-name mismatch. The user tested with a "Sales Manager"-roled user for starting shifts, which isn't even one of the roles this code checks — worth confirming what other role(s) that test user actually holds.
2. **Shift-open check misreports after midnight** — once the clock crosses into a new day, the app reports the still-open shift as "opened on a previous day," even though it's the same still-open shift. A day-boundary bug in the open-shift validation/display logic.

**How to apply when revisited**: start #1 by checking the Electron client's own start-shift gating (`src/core/pos-session.ts`'s `startPosSession`/`getActivePosSession`, or renderer-side role checks) against the server's actual `can_start_shift` response — the server doesn't restrict this, so any restriction is client-added or a separate ERPNext permission failure surfacing as a generic error. Start #2 by finding where "opened on a previous day" is derived (likely a local date-string comparison in shift-summary code) and checking UTC vs. local-time comparison across midnight.

3. **Changing the system date mid-shift messes up the open shift** (2026-07-11, reported alongside #2 — likely the same underlying date-comparison root cause, but noted separately since the user described it as a distinct trigger: manually changing the date, not just crossing midnight naturally).
4. **A newly-created bill didn't show up in sales history immediately** (2026-07-11) — user billed once (didn't appear in the history/sales list), billed a second time, then closed the shift; both bills were correctly counted in the shift-closing totals. So the underlying data was recorded correctly (no data loss, no double-count) — this is a **display/refresh bug only** in the history list, not a data-integrity issue. User called it "tiny." Likely the sales-history view isn't refetching/refreshing after a new bill is created (stale list state) rather than anything at the API/data layer.

**2026-07-11 update**: user reiterated explicitly not to touch shift-related code yet ("just dont touch shift" / "lets touch shift later") while scoping a separate, larger Posapplication UX/reliability plan (cashier rights/PINs, refund flow, login, F6 payment-split screen, mode-of-payment selection) — shift handling (including items #1-4 above) is deliberately excluded from that plan's scope for now.
