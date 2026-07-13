# Aimatic POS App — Claude Code Guidance

## Repository overview

**Aimatic POS App** — a Windows desktop Electron POS terminal (TypeScript, SQLite, ERPNext/Frappe APIs) for retail stores running the `aimatic` Frappe app. Online-first with offline sale support via a local SQLite cache and durable sale queue. Current version tracked in `package.json` (independent from the server app's versioning).

**ERPNext/`aimatic` is the source of truth** for final invoice calculations, stock, accounting, POS Invoice/refund submission, FBR e-invoicing submission, and loyalty/gift-voucher redemption. Electron owns only local UI/cache/offline-queue state, local receipt printing, and local PIN verification — **it must never call FBR directly**. See `docs/architecture.md` for the full runtime/data model, `docs/offline-pos-rules.md` for offline queue/PIN rules, and `docs/fbr-refund-rules.md` for FBR/refund contract details — those three files are the canonical reference; this section is only a map to them.

- Server counterpart: `~/frappe-bench/apps/aimatic` (repo `BeelBegins/aimatic`, see that repo's own CLAUDE.md), branch `fbr-pos-integration`. The client talks to it exclusively through the whitelisted `aimatic.offline_pos`/`aimatic.gift_voucher` API surface listed in `docs/architecture.md`'s "ERPNext API Contract" section — do not add new server calls without checking that surface first.
- Key files: `src/main.ts` (Electron bootstrap, IPC handlers, all ERPNext API calls — `contextIsolation: true`, `nodeIntegration: false`), `src/preload.ts` (the *only* renderer bridge, exposes `window.posAPI`), `src/renderer/renderer.ts` (screens/routing/keyboard shortcuts), `src/db/database.ts` (versioned SQLite schema — cache, offline queue, sales history, held sales, shift history), `src/domain/fbr-calculation.ts` (local FBR *estimate* only, never final).
- Local cache is not site-scoped (no table carries the server URL), so `main.ts`'s `settings:save` handler calls `database.ts`'s `clearSiteScopedCache()` whenever `erpnextUrl`/`apiKey` changes — otherwise a repointed terminal keeps serving the old site's cached catalog/POS Profile/cart data (see `docs/architecture.md`'s `src/db/database.ts` section for the exact table list).
- Settings has a cosmetic, client-only `colorTheme` field (default `warm-market`; other options are CSS palette swaps applied via `document.documentElement.dataset.theme`, see `docs/architecture.md`'s "Settings And URL Handling" section) — purely UI, not server-meaningful, and untouched by `clearSiteScopedCache()`.
- `src/db/IDatabaseService.ts` — the persistence-layer contract extracted from `database.ts`'s exports, kept purely as a type (no second implementation exists). It exists so a future non-SQLite backend (e.g. a CapacitorJS/Android port using `@capacitor-community/sqlite`) has an explicit target to implement rather than needing to reverse-engineer one from `main.ts`'s call sites. A compile-time check at the bottom of that file (`AssertCurrentModuleImplementsContract`) fails `tsc` if `database.ts`'s exports ever drift from this interface — update the interface, not the check, when that happens. `main.ts` still imports `database.ts` directly today; nothing about how it's wired changes until/unless a second backend is actually built.
- Commands: `npm run dev` (watch + run), `npm run build` (tsc + copy renderer assets), `npm run dist` / `dist:protected` (NSIS installer, the latter also obfuscates via `scripts/obfuscate.cjs`), `npm run release` (build + publish GitHub release via `scripts/publish-github-release.cjs`), `npm run rebuild` (rebuilds `better-sqlite3` native bindings, runs automatically as `postinstall`).
- `npm test` (Node's built-in test runner) covers `src/domain/fbr-calculation.ts` (tax/refund math) and `src/db/database.ts` (schema/migrations, settings + API-secret masking, held sales, sales-history/offline-queue idempotency, refund logging + shift-reconciliation totals, cart/payment/benefits drafts). It does **not** cover `src/main.ts`/`src/preload.ts`/`src/renderer/renderer.ts` (IPC/UI glue — much higher-friction to unit test; not attempted).
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

