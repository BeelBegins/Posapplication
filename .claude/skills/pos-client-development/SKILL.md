---
name: pos-client-development
description: Use for Electron or Android retail POS development, cashier/supervisor auth, sales/refunds, payments, shifts, offline queue/idempotency, local cache/SQLite, receipt printing, FBR estimates, customer display, updater, keyboard/hardware, preload/IPC, or POS-specific mobile behavior.
---

# POS client development

Read only the relevant sections of `docs/architecture.md`,
`docs/offline-pos-rules.md`, `docs/fbr-refund-rules.md` and
`docs/android-authentication.md`.

## Invariants

- Server results are authoritative after an online submit; local calculations
  are estimates and provisional offline state only.
- Preserve stable request IDs and durable queue state across retries/restarts.
- Never allow offline refund, offline close-shift or offline customer creation.
- Never send a local `OFFLINE-*` session ID as an ERP opening entry.
- Keep cashier identity separate from supervisor/admin step-up approval.
- Renderer access goes only through the narrow preload bridge; keep
  `contextIsolation` enabled and `nodeIntegration` disabled.
- Cache is not site-scoped, so endpoint/credential changes must clear the
  documented site data while preserving cosmetic settings.
- Native dialogs can break Windows focus; keep confirmations renderer-owned.
- Online receipts replace local payment/change estimates with persisted server
  values. Electron never calls FBR directly.

Trace changes through `src/main.ts`, `src/preload.ts`, renderer, database/domain
modules and the server endpoint. Test retry, restart, duplicate, return/cancel,
partial failure and degraded/offline states.
