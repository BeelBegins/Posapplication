# Weighing scale labels — handoff

Status as of 2026-10-31. Branch `claude/keen-einstein-3y522g`. Code, tests (132 pass) and docs are in; **nothing has been tried on a real scale, a real till or a real ERP yet.**

## What it does
A label printed by a price-computing scale is `[prefix][item digits][weight|price|count digits][check digit]`, e.g. `20 29111 01250 2`. Scanning it adds that item to the cart with the weight as a decimal quantity (1.250 Kg). Works offline and on Android.

- Parser (pure, tested): `src/domain/weighted-barcode.ts`. Layout is configuration (`ScaleRule`), not code: prefix, item digits, value digits, weight/price/count, gram or kg + decimals, optional EAN check digit, `lookupPrefix`.
- Lookup: `src/core/scale-lookup.ts` `lookupWithScale()`, used by Electron (`catalog:lookup` in `main.ts`) and Android (`mobile.ts`). A normal barcode/item-code hit always wins; only a miss is read as a label.
- Rules are stored in `app_meta` key `scale_rules_v1` (per till, not synced from ERP). Until saved, the default is `20` + 5 item + 5 grams + check digit, `lookupPrefix` `SC`.
- UI: Settings → Printer & Finish → "Weighing scale labels" (rule editor + test box that runs a label through the real lookup). Cart: `addToCart()` in `renderer.ts` adds each label as its own line.
- Errors (alert, nothing added): wrong check digit, item not found, item UOM not Kg/Gram for a weight label, price label with no selling price, zero weight.

## Key decision: the `SC` prefix
The scale prints only the digits (`29111`). In ERP the Item Barcode is stored as **`SC29111`**. Ordinary barcodes are all digits, so a scale item can never be mistaken for an existing item that already owns `29111` (which would silently sell the wrong item). Item digits can be any length 1–10. The rule's "ERP barcode starts with" must equal the prefix used in the import file (`--key-prefix`).

## Item import
`scripts/generate-scale-items.py` (needs `pip install openpyxl`) builds the ERP Item import workbook from a CSV of `Description, Type, Sub Category`:
`python3 scripts/generate-scale-items.py docs/weighing-scale/ws-items-source.csv out.xlsx [--start 29111] [--digits 5] [--uom Kg] [--key-prefix SC] [--tax-category X] [--taken used_plus.txt]`
Sheets: "Item Import" (ID blank → ERP naming series assigns item_code) and "Scale PLU List" (what to program into the scale). Re-run with a higher `--start` for later batches so PLUs never repeat.
Current batch: `docs/weighing-scale/WS-scale-items-import.xlsx` — 31 "WS" items, PLU 29111–29141, barcodes SC29111–SC29141, UOM Kg, FBR Tax Category "Exempt goods". The 10001 series was dropped as too common; on `szl` (2026-10-31) no barcode or item code equals any 29xxx number, its SC form, or a `2029…` label. WS BAJRA is in Pulses, where the existing bajra items are (no Bajra Item Group exists).
Create the items with `apps/aimatic/ipos_data_migration/create_weighing_scale_items.py` (dry-run by default, blocks on any collision, idempotent). Rehearsed on `siezal` 2026-10-31: 31 created (STO-ITEM-2026-22781…22811), re-run skips all 31.

## Still to do (owner: Nabeel unless noted)
1. Done: FBR Tax Category "Exempt goods".
2. Done: all Item Groups exist on `szl` (Bajra mapped to Pulses).
3. Done on `szl` 2026-11-01: 31 items STO-ITEM-2026-29598…29628 (SC29111…SC29141), backup `20261101_002040-szl-database.sql.gz`. Rollback: delete those 31 items while they have no transactions.
4. Create **Item Price per Kg** for the POS price list, then sync the catalogue on each till. Without a price the till reports "Missing local item price" offline.
5. **Program the scale** (Nikasi; manual not found online): EAN-13, prefix 20, item/PLU 5 digits, weight 5 digits in grams, check digit last; PLU = the "PLU" column of the "Scale PLU List" sheet. If the scale offers a different layout, print one label and set the rule to match (Settings test box).
6. **Test on a till**: scan a label online and offline; wrong-check-digit label; non-weight UOM item; sale → ERP POS Invoice with decimal qty and FBR. The server (`aimatic`, read-only here) was not changed or tested for decimal quantity from a label: `submit_online_sale` resolves the item by `item_code`, so the POS sends the item code, not the label.
7. Done: on a weighed line the quantity +/- keys open the quantity dialog to enter the weight, instead of stepping by 1. A normal scan of the same item never merges into a weighed line.
8. Built (not deployed): central ERP **Weighing Scale Settings** (Single DocType + `Weighing Scale Rule` table, `aimatic.offline_pos.api.get_weighing_scale_rules`). One set for all ~20 POS Profiles; tills pick it up on catalogue sync and keep it offline. Per-profile override deferred until a second scale model appears. Server part live on `szl` 2026-11-01 ~01:00 PKT (aimatic `cf124dd`): the two DocTypes loaded with `reload_doc` (no full migrate), cache cleared, web restarted; endpoint answers `managed: false` until the page is filled and enabled. Backup `20261101_005710-szl-database.sql.gz`. Tills use it only after the POS release.

## Gift voucher question (shift summary print)
The printed shift summary (`buildShiftSummaryHtml()`) has no "Claimed Gift Vouchers" line. It prints Opening, Sales, Refunds, Expected, Actual, Difference, "Amount Received by Mode" and "Difference by mode". A gift voucher redemption is its own payment row on the POS Invoice (server comment in `offline_pos/api.py`), so it appears there only as a payment mode name, if the server includes it. Adding a dedicated line needs a server-side total.
