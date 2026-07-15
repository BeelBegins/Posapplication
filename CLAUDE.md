# Aimatic POS App — Claude Code Guidance

## Repository overview

**Aimatic POS App** — a shared TypeScript codebase for focused Ai Matic products backed by the `aimatic` Frappe app. Retail POS ships on Windows through Electron and on Android through Capacitor; Restaurant is a separate Android product, while Sales and Shopping remain build-disabled until their phases are complete. Retail POS is online-first with offline sale support via the existing cache and durable sale queue. Current version is tracked in `package.json` (independent from the server app's versioning).

**ERPNext/`aimatic` is the source of truth** for final invoice calculations, stock, accounting, POS Invoice/refund submission, FBR e-invoicing submission, and loyalty/gift-voucher redemption. Electron owns only local UI/cache/offline-queue state, local receipt printing, and local PIN verification — **it must never call FBR directly**. See `docs/architecture.md` for the full runtime/data model, `docs/offline-pos-rules.md` for offline queue/PIN rules, and `docs/fbr-refund-rules.md` for FBR/refund contract details — those three files are the canonical reference; this section is only a map to them.

- Server counterpart: `~/frappe-bench/apps/aimatic` (repo `BeelBegins/aimatic`; developer guidance is in `~/frappe-bench/CLAUDE.md`), branch `master`. The client talks to it through centralized domain API modules; inspect and reuse the existing whitelisted `aimatic.offline_pos`/`aimatic.gift_voucher` surface before adding endpoints. ERPNext remains the business-rule and permission authority.
- Key files: `src/main.ts` (Electron bootstrap, IPC handlers, all ERPNext API calls — `contextIsolation: true`, `nodeIntegration: false`), `src/preload.ts` (the *only* renderer bridge, exposes `window.posAPI`), `src/renderer/renderer.ts` (screens/routing/keyboard shortcuts), `src/db/database.ts` (versioned SQLite schema — cache, offline queue, sales history, held sales, shift history), `src/domain/fbr-calculation.ts` (local FBR *estimate* only, never final).
- Local cache is not site-scoped (no table carries the server URL), so `main.ts`'s `settings:save` handler calls `database.ts`'s `clearSiteScopedCache()` whenever `erpnextUrl`/`apiKey` changes — otherwise a repointed terminal keeps serving the old site's cached catalog/POS Profile/cart data (see `docs/architecture.md`'s `src/db/database.ts` section for the exact table list).
- Settings has a cosmetic, client-only `colorTheme` field (default `warm-market`; other options are CSS palette swaps applied via `document.documentElement.dataset.theme`, see `docs/architecture.md`'s "Settings And URL Handling" section) — purely UI, not server-meaningful, and untouched by `clearSiteScopedCache()`.
- `src/db/IDatabaseService.ts` — the persistence-layer contract extracted from `database.ts`'s exports, kept purely as a type (no second implementation exists). It exists so a future non-SQLite backend (e.g. a CapacitorJS/Android port using `@capacitor-community/sqlite`) has an explicit target to implement rather than needing to reverse-engineer one from `main.ts`'s call sites. A compile-time check at the bottom of that file (`AssertCurrentModuleImplementsContract`) fails `tsc` if `database.ts`'s exports ever drift from this interface — update the interface, not the check, when that happens. `main.ts` still imports `database.ts` directly today; nothing about how it's wired changes until/unless a second backend is actually built.
- Product/build separation is defined in `src/config/product-profiles.json` and enforced by the build scripts. Electron is POS-only. Do not put Restaurant, Sales, or Shopping screens into the POS renderer and hide them with CSS/roles. See `docs/product-architecture.md` and `docs/build-profiles.md`.
- Platform detection and platform-specific behavior stay centralized. Electron-only IPC, printing, filesystem, updater, hardware, and keyboard behavior must never be imported by Android code; Capacitor plugins must not load during Electron startup.
- Authentication is platform-specific behind the shared API layer: Electron keeps terminal-token credentials; Android POS has no API Key/API Secret UI and uses one-time device enrollment plus per-cashier OAuth2 Authorization Code with PKCE. Android configuration/tokens are stored through the native Keystore-backed `SecureStoragePlugin`. `src/api/client.ts` owns auth-mode headers and the single 401 refresh/retry path; do not add raw authorization headers elsewhere. See `docs/android-authentication.md`.
- Android auth entry points are `src/mobile/device-enrollment.ts`, `oauth-pkce.ts`, `capacitor-oauth-browser.ts`, `credential-provider.ts`, and `secure-storage.ts`. Native registration is in `android/app/src/main/java/com/beelbegins/aimaticpos/MainActivity.java`; the encrypted storage bridge is `SecureStoragePlugin.java`; the OAuth callback is `com.beelbegins.aimaticpos://oauth/callback`.
- Shopping code lives under `src/products/shopping/`. Its auth adapter accepts only `customer-session`; it must never accept terminal credentials, internal ERPNext users, generic Resource API access, costs, purchasing, accounts, or administrative data. The Shopping profile remains disabled until its server APIs and end-to-end security gates are complete.
- Commands: `npm run dev` (watch + run), `npm run build` (tsc + copy renderer assets), `npm run dist` / `dist:protected` (NSIS installer, the latter also obfuscates via `scripts/obfuscate.cjs`), `npm run release` (build + publish GitHub release via `scripts/publish-github-release.cjs`), `npm run rebuild` (rebuilds `better-sqlite3` native bindings, runs automatically as `postinstall`).
- `npm test` (Node's built-in test runner) covers domain/database behavior plus shared API authentication, PKCE, credential-provider isolation, device enrollment, and Shopping authentication boundaries. It does **not** fully cover `src/main.ts`/`src/preload.ts`/renderer UI glue or physical Android browser/deep-link behavior, so desktop smoke tests and real-device enrollment/login checks remain release gates.
  - `tsconfig.test.json` compiles `src/domain/**`, `src/db/**`, and `test/**` to `.test-out/` (gitignored, wiped at the start of every `npm test` run — never shipped in the `electron-builder` installer, which only packages `dist/**`).
  - `database.ts` imports Electron's `app` at module scope (`app.getPath("userData")`) and pulls in `better-sqlite3`, a native addon rebuilt for **Electron's** ABI by the `postinstall`/`electron-rebuild` step — it will fail to load under a plain `node` process (`NODE_MODULE_VERSION` mismatch). So the test script runs through the local `electron` binary itself in Node-only mode (`cross-env ELECTRON_RUN_AS_NODE=1 electron --experimental-test-module-mocks --test .test-out/test`), which uses Electron's own bundled Node runtime (matching ABI) and Node's built-in module-mocking (`node:test`'s `mock.module`, still experimental) to fake `app.getPath` before `database.ts` is first required — see `test/db/database.test.ts`'s header comment. Note Electron's bundled Node is older than the system Node (e.g. Electron 33 ships Node 20), so `--test <dir>` (not a glob pattern) is used for file discovery — glob support in `node --test` arguments needs a newer Node than Electron currently bundles.
  - Add new unit-testable logic under `src/domain/` (pure, no Electron/SQLite import) when possible — it avoids the mocking/ABI machinery entirely, same as `fbr-calculation.ts`.
  - CI (`.github/workflows/build-release.yml`) runs `npm test` right after `npm ci`, before the installer build/publish steps — a failing test blocks the release.
  - `docs/architecture.md`'s "Build And Test" section still lists the manual verification checklist (online/offline sale, refund, receipt/duplicate print, close shift with refund, cashier login online/offline, settings/shift PIN, auto-update) required before a release — `npm test` doesn't replace that, it only covers the calculation/persistence layer, not the UI/IPC flow.
- Operational boundaries (don't change without server alignment — full list in `docs/architecture.md`): tax calculation contract, FBR payload contract, refund payload contract, POS Opening/Closing Entry ownership, payment reconciliation rules, gift voucher/loyalty settlement rules. Never send an `OFFLINE-*` local session ID to ERPNext as `opening_entry`; never allow offline refunds, offline close-shift, or offline customer creation.

## Rules

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary — prefer editing existing files
- NEVER create documentation files unless explicitly requested
- NEVER save working files or tests to root — use `/src`, `/tests`, `/docs`, `/config`, `/scripts`
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files
- NEVER add a `Co-Authored-By` trailer to user commits unless this project's `.claude/settings.json` has `attribution.commit` set (#2078). The Claude Code Bash tool may suggest one in its default commit-message template — ignore it. `Co-Authored-By` is semantic authorship attribution under git/GitHub convention; the tool is the facilitator, not a co-author.
- Keep files under 500 lines
- ALWAYS consult this `CLAUDE.md` before making changes.
- After completing a task, review this guidance and update it when the work introduces durable project knowledge, conventions, or operational rules.
- Validate input at system boundaries

## Build & Test

- ALWAYS run tests after code changes
- ALWAYS verify build succeeds before committing

```bash
npm run build && npm test
```
