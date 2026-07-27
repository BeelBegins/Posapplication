# Posapplication development guide

This is the always-loaded router for Claude and Codex. Product architecture
and incident detail stays in task-specific skills and `docs/` so it is loaded
only when relevant. The complete former root guide is preserved in
`docs/ai-guidance-archive-2026-07-28.md`; its version claims are historical.

## Authority

Use this order when facts conflict:

1. local code, configuration, package version and uncommitted diff;
2. verified runtime/server behavior;
3. current focused docs and skills;
4. dated historical guidance;
5. remote Git state.

The local worktree is primary during development. Never discard unfamiliar
changes. Current application version is `package.json` (3.0.4 when this guide
was reorganized); do not hard-code it elsewhere as current.

## Critical boundaries

- Retail POS is business-critical and handles roughly 2,000 transactions per
  day. Preserve sale/refund, payment, shift, offline queue/idempotency,
  receipt, pricing, FBR, stock/GL and permission behavior.
- ERP/aimatic is authoritative for final calculations, stock, accounting,
  invoice/refund/FBR submission, permissions, loyalty and vouchers. Clients
  must not trust their own price, identity, authorization or final totals.
- Electron owns local UI/cache/queue/printing/PIN behavior and never submits
  directly to FBR.
- Product separation is mandatory: POS, Sales, Shopping and Restaurant have
  distinct entry points, auth, navigation, APIs, builds and release artifacts.
- Public mobile clients use OAuth Authorization Code with PKCE and no client
  secret. Never commit keys, tokens, keystores, passwords or `.env` files.
- Platform-specific Electron/Capacitor behavior stays behind existing bridges
  and adapters. Do not import Electron APIs into Android paths.
- User-facing branding says `ERP`; compatibility identifiers remain unchanged.

## Release gate

Every push to `main` runs the full release workflow and publishes all products.
A `main` push is never a routine documentation/code push. It requires an
intentional versioned release, complete tests/builds, artifact review and user
approval. Guidance-only work stays on a non-release branch.

Load `.claude/skills/posapplication-release/SKILL.md` before release work.

## Route work

- POS/Electron/Android POS, payments, shifts, offline queue, cache, receipts,
  auth or hardware: `pos-client-development`.
- Sales, Shopping, Restaurant, shared mobile UI/API/auth or product boundaries:
  `product-client-development`.
- Builds, APK/AAB/PWA/NSIS, versioning, CI, tags or GitHub releases:
  `posapplication-release`.

Canonical focused docs:

- `docs/architecture.md`: runtime/data/build/test architecture.
- `docs/offline-pos-rules.md`: queue, PIN and offline invariants.
- `docs/fbr-refund-rules.md`: FBR and refund contracts.
- `docs/android-authentication.md`: device enrollment, OAuth and secure storage.
- `docs/product-architecture.md`, `docs/build-profiles.md`: product isolation.
- `docs/mobile-sales-phase3.md`, `docs/shopping-preparation.md`,
  `docs/restaurant-phase2.md`: product-specific behavior.
- `docs/api-contracts.md`: client/server API contracts.
- `docs/known-issues.md`: deferred issues requiring re-verification.
- `docs/historical-core-extraction.md`: superseded extraction/release history.

Server counterpart: `/home/nabeel/frappe-bench/apps/aimatic`. Read its scoped
instructions and align server/client changes in the same task.

## Validation

Safe local tests/builds are allowed and expected for code changes:

```bash
npm run build
npm test
```

Use the product-specific build named in `package.json` when relevant. Tests do
not cover every renderer/IPC/native/deep-link/hardware path; complete the
manual smoke and real-device gates in `docs/architecture.md` before release.
Do not run live sale/refund/FBR tests without explicit approval and a rollback
plan.

## Keep guidance current

When a durable contract, entry point, product boundary, release rule or known
incident changes, update the closest doc/skill in the same commit. Keep this
router short. Preserve dated history instead of presenting old versions or
site roles as current.
