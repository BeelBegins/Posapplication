# Google Play Store readiness — status & plan

**Session:** 2026-07-18, overnight autonomous work while the user was asleep, following an
explicit "come up with a plan and do the work, keep docs updated" instruction. Everything below
is done and committed **locally**; nothing was pushed to a production/live target except the
aimatic.tech static site itself (see "What actually went live" below) and three unpublished
draft Web Pages. Read "Review these on resume" first.

## Review these on resume

The user said "ask questions now" then went offline before answering. Rather than block all
night on that, I stated working assumptions and proceeded — each of these needs a real decision:

1. **Google Play Developer account** — assumed not yet set up (never confirmed). This is a
   $25 one-time fee + identity verification (can take days) and is the single highest-leverage
   thing to start independently of anything below — nothing here can actually be submitted
   without it.
2. **Shopping account deletion** — built the *request* path only (in-app button, logged
   request, public web page). Did **not** build automatic destructive deletion of Customer/Sales
   Order data — those records are linked to invoices with tax/accounting retention obligations,
   and hard-delete-vs-anonymize-vs-time-delay is a retention-policy decision, not something to
   default unilaterally. Needs explicit sign-off before that half gets built.
3. **Per-site Terms & Conditions** (szl/hsm/siezal) — built as a Frappe Web Page per site,
   generic retail T&C adapted per business name, **created unpublished** specifically so no real
   customer or Play reviewer sees unreviewed legal text. Review the content, then publish via
   Desk (Web Page → the record → Published checkbox) when ready.
4. **Sales app "not seamless"** — no specific repro was given. Diagnosed via direct code
   reading and found a real bug (below); fixed it, but this was not confirmed against the user's
   actual experience since there was no one to ask.
5. **`ask-nemotron` hung** on the one long-form drafting task attempted (privacy policy content,
   ~30+ min with zero output on a free-tier OpenRouter model) — killed it and wrote that content
   directly instead. Noting this in case the tool itself needs attention; it wasn't reliable for
   this use case tonight.

## What actually went live vs. what's staged for review

Two different deploy models were in play tonight — important not to conflate them:

- **`~/aimatic-website`** (aimatic.tech) is Caddy-served directly from the directory
  (`file_server`, no build step) — **editing the file is the deployment**. The privacy policy,
  terms, and new data-deletion page are **live on aimatic.tech right now**, confirmed by
  fetching the published page after committing. This repo had no git history before tonight
  (`git init`'d locally, no remote configured — consider adding one).
- **Posapplication** (`~/Posapplication`) and **apps/aimatic** (this bench) both need an
  explicit push/deploy step I deliberately did not take — see "Deliberately not pushed/deployed"
  below.

## Deliberately not pushed/deployed — do this on resume

- **Posapplication: 4 commits sitting on local `main`, not pushed** (`37d2907`, `ec5ad6a`,
  `dfa7062`, `707377d`). Every push to `main` triggers a real, unconditional CI release
  (`build-release.yml`) that publishes signed builds and offers itself to real POS terminals via
  Electron's auto-updater — no staged rollout gate. That's not something that should fire
  unattended overnight. **On resume**: `git log --oneline -6` to review, bump `package.json`'s
  version (per the `posapplication-release` skill's own
  rule — an unbumped version silently overwrites the current v2.7.4 release), then push when
  ready.
- **apps/aimatic: 1 commit on local `master`, not pushed**, adding the `Shopping Account
  Deletion Request` doctype. This needs `bench --site <site> migrate` on szl/hsm/siezal before
  `request_account_deletion` is callable, plus the usual gunicorn restart (`sudo supervisorctl
  restart frappe-bench-frappe-web frappe-bench-frappe-short-worker
  frappe-bench-frappe-long-worker`). Not run tonight since it's a new schema change touching
  production sites, unreviewed.
- **szl/hsm/siezal Terms & Conditions Web Pages** — created but `published=0` (see #3 above).

## Products and their Play Store status

| Product | Play Store candidate? | Notes |
|---|---|---|
| **POS** | Yes | Electron-primary, Android secondary. Branded icon now wired in (was generic before tonight). |
| **Sales** | Yes | Branded icon added; one real cart-carryover bug found and fixed (see below). |
| **Shopping** | Yes, once account-deletion request flow is deployed | The one product with real end-customer accounts — this is where Play's account-deletion policy actually applies. |
| **Restaurant** | **No** | Still demo/mock-backed. Kept its original generic icon (no branded asset exists, and it's out of Play Store scope). |

## Completed workstreams

### 1. Launcher icons — done
`android/app/src/main/res-<product>/` is now a dedicated icon source set per product (5-density
legacy + adaptive icon), swapped in via `build.gradle` based on the existing `AI_MATIC_PRODUCT`
env var. Restaurant kept the original placeholder as its own set (AGP errors on same-name
resource conflicts across multiple `srcDirs` in one sourceSet, so "override the shared default"
doesn't work — every product needs a fully separate set). **Verified for real**: built all 4
products (`gradlew assembleDebug`), unzipped the actual `pos` APK, confirmed the packaged
`mipmap-xxxhdpi/ic_launcher.png` is genuinely the branded icon. Commit: `37d2907`.

### 2. aimatic.tech privacy policy + terms — done, live
Expanded from POS-only to cover POS/Sales/Shopping/Restaurant with real per-product facts (not
generic filler) plus a new "Requesting deletion of your account or data" section and a dedicated
`data-deletion.html` page — the public URL Play Console's Data Safety form requires. Live at
aimatic.tech, confirmed by direct fetch post-commit. Commit: `fae7097` (in the newly-tracked
`~/aimatic-website` repo).

### 3. Shopping account-deletion request flow — built, not deployed
Client: "Privacy & data" section on the Shopping Account screen, confirm-gated Request Account
Deletion button, status display once submitted. Server: `aimatic.shopping.api
.request_account_deletion` (idempotent) + `get_account_deletion_status`, logging to a new
`Shopping Account Deletion Request` doctype (System Manager visibility, matching the `AI
Assistant Message` audit pattern). Explicitly does not delete/anonymize anything automatically —
see "Review these on resume" #2. Commits: `dfa7062` (client, Posapplication), `ca3d814` (server,
aimatic) — **not migrated/deployed yet**.

### 4. Per-site Terms & Conditions — content created, unpublished
Generic retail T&C (pricing accuracy, order acceptance, delivery, returns, account deletion
cross-link, liability, Pakistan governing law) created as a Frappe Web Page (route `/terms`) on
szl (Test Company), hsm (Hatim Super Market), siezal (Siezal Super Market) — **all
`published=0`** by design (see #3 above). `shop.aimatic.tech`, the one live Shopping storefront
today, is wired to `siezal` specifically (`Caddyfile`: proxies to `127.0.0.1:8081`), so siezal's
page is the one that matters first.

### 5. Sales app cart-carryover bug — found and fixed
Switching customers (direct pick, or the "Change" button) or switching branch left `draft.items`
untouched while clearing the cached item-price index — so items added under one customer's
pricing silently carried into a different customer's order, rendering at a stale/zero price
until re-searched. `SalesDraft` models exactly one customer per draft, so this violated the
draft's own invariant. Fixed via a new pure `switchDraftCustomer` function in `domain.ts`
(testable, matching the existing pattern of keeping business rules out of `app.ts`'s DOM glue) —
clears items only on an actual customer change, keeps them on re-selecting the same customer;
both switch points now confirm before discarding a non-empty cart. Verified: `tsc --noEmit`
clean, full test suite 86/86 passing (2 new tests added). **Not verified against a live
device/emulator** — this is a logic-level fix from direct code reading, not a confirmed repro of
whatever the user actually experienced, since no specific complaint was given. Commit: `ec5ad6a`.

### 6. Final readiness pass — this section

## Play Store listing copy (draft — for when the Developer account exists)

### Ai Matic POS
- **Short description** (≤80 chars): `Offline-first retail POS built on ERPNext — never lose a sale to a dropped connection.`
- **Full description**: Ai Matic POS is a point-of-sale terminal built directly on your own
  ERPNext server. Ring up sales, scan barcodes, and keep working even when the connection drops
  — every sale queues locally and syncs the moment you're back online, so a lost connection never
  means a lost sale. Cashiers sign in with their own ERPNext-verified credentials or an offline
  PIN for short connectivity gaps. Runs on Windows (desktop terminal) and Android. Requires an
  ERPNext server your business controls — Ai Matic does not operate a central server that
  collects your sales, customer, or catalog data.

### Ai Matic Sales
- **Short description**: `Field sales ordering for ERPNext — customer pricing, live stock, offline drafts.`
- **Full description**: Ai Matic Sales is a focused mobile tool for your own sales team. Search
  customers and see their outstanding balance, credit limit, and customer-specific pricing in
  one place; search or scan items to check live warehouse stock; build an order and submit it
  straight into ERPNext as a draft Sales Order. Works offline — orders queue on the device and
  sync automatically once you're back online, with duplicate-safe retries. Each salesperson signs
  in with their own individual ERPNext account; there is no shared login. Requires an ERPNext
  server your business controls and a Sales User/Sales Manager role.

### Ai Matic Shopping
- **Short description**: `Shop your favorite local store — browse, order, and pick a delivery or pickup time.`
- **Full description**: Ai Matic Shopping connects customers directly to a business's own
  storefront, built on their ERPNext catalogue. Browse products, add to cart, and check out with
  Cash on Delivery or Store Pickup. Track your order from placed to delivered in plain,
  customer-friendly status updates. Creating an account is quick and secure; you're always in
  control of your data, with an in-app option to request deletion of your account and personal
  information at any time.

## Data Safety form — mapping to the expanded privacy policy

Google Play's Data Safety questionnaire asks what data each app collects/shares and why. Based
on the privacy policy content added tonight:

| Product | Data types collected | Shared with third parties? | Deletable on request? |
|---|---|---|---|
| POS | Account/auth info (ERPNext credentials or OAuth session), device ID (locally generated, not ad-tracking), app activity (sales/catalog/customer data synced with the business's own ERPNext) | No | Via the business's ERPNext administrator |
| Sales | Account/auth info (employee OAuth session), app activity (customer/pricing/order data from the business's own ERPNext) | No | Via the business's ERPNext administrator |
| Shopping | Account/auth info (customer OAuth session), personal info (name, email, phone, delivery address), app activity (cart, order history) | No | Yes — in-app request flow + `aimatic.tech/data-deletion.html` (see workstream 3) |

None of the three collect precise location, financial account numbers (no payment gateway is
integrated — Shopping is Cash on Delivery/Store Pickup only), health data, or messages. All data
in transit is HTTPS-only (existing app requirement, unrelated to tonight's work).

## Per-product submission checklist

**POS**
- [x] Branded launcher icon (tonight)
- [x] Privacy policy covers this product (tonight)
- [ ] Play Developer account exists
- [ ] AAB downloaded from the latest CI run and uploaded to Play Console (see the
      `posapplication-release` skill for how to pull the artifact — `.aab`, not the `.apk` that
      publishes to GitHub Releases)
- [ ] Store listing copy pasted in (draft above)
- [ ] Data Safety form filled in (mapping above)
- [ ] Content rating questionnaire completed

**Sales**
- [x] Branded launcher icon (tonight)
- [x] Privacy policy covers this product (tonight)
- [x] Cart-carryover bug fixed (tonight) — low confidence this is *the* issue the user meant,
      since no repro was given; worth confirming with them directly
- [ ] Same remaining steps as POS above

**Shopping**
- [x] Branded launcher icon (tonight)
- [x] Privacy policy + data-deletion page (tonight)
- [x] Account-deletion request flow built (tonight) — **not yet deployed**, see "Deliberately
      not pushed/deployed" above; must be live before this product is actually submitted, or the
      privacy policy will describe a feature that doesn't exist yet
- [ ] Per-site Terms & Conditions reviewed and published (currently draft/unpublished on
      szl/hsm/siezal)
- [ ] Same remaining Play Console steps as POS above

**Restaurant** — not a candidate. No action.

## Tooling note

`ask-nemotron` was used for background research/second-opinion earlier in the session
successfully, but hung (30+ min, no output) on the one long-form drafting task attempted tonight
and had to be killed — see "Review these on resume" #5. Everything it would have drafted was
written directly instead, grounded in facts verified via direct code/doc reading before writing
(see the module docstrings and commit messages for what was verified vs. assumed).
