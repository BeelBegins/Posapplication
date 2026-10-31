# Weighing scale labels — handoff

Status as of 2026-10-31. Branch `claude/keen-einstein-3y522g`. Code, tests (132 pass) and docs are in; **nothing has been tried on a real scale, a real till or a real ERP yet.**

## What it does
A label printed by a price-computing scale is `[prefix][item digits][weight|price|count digits][check digit]`, e.g. `20 10001 01250 3`. Scanning it adds that item to the cart with the weight as a decimal quantity (1.250 Kg). Works offline and on Android.

- Parser (pure, tested): `src/domain/weighted-barcode.ts`. Layout is configuration (`ScaleRule`), not code: prefix, item digits, value digits, weight/price/count, gram or kg + decimals, optional EAN check digit, `lookupPrefix`.
- Lookup: `src/core/scale-lookup.ts` `lookupWithScale()`, used by Electron (`catalog:lookup` in `main.ts`) and Android (`mobile.ts`). A normal barcode/item-code hit always wins; only a miss is read as a label.
- Rules are stored in `app_meta` key `scale_rules_v1` (per till, not synced from ERP). Until saved, the default is `20` + 5 item + 5 grams + check digit, `lookupPrefix` `SC`.
- UI: Settings → Printer & Finish → "Weighing scale labels" (rule editor + test box that runs a label through the real lookup). Cart: `addToCart()` in `renderer.ts` adds each label as its own line.
- Errors (alert, nothing added): wrong check digit, item not found, item UOM not Kg/Gram for a weight label, price label with no selling price, zero weight.

## Key decision: the `SC` prefix
The scale prints only the digits (`10001`). In ERP the Item Barcode is stored as **`SC10001`**. Ordinary barcodes are all digits, so a scale item can never be mistaken for an existing item that already owns `10001` (which would silently sell the wrong item). Item digits can be any length 1–10. The rule's "ERP barcode starts with" must equal the prefix used in the import file (`--key-prefix`).

## Item import
`scripts/generate-scale-items.py` (needs `pip install openpyxl`) builds the ERP Item import workbook from a CSV of `Description, Type, Sub Category`:
`python3 scripts/generate-scale-items.py docs/weighing-scale/ws-items-source.csv out.xlsx [--start 10001] [--digits 5] [--uom Kg] [--key-prefix SC] [--tax-category X] [--taken used_plus.txt]`
Sheets: "Item Import" (ID blank → ERP naming series assigns item_code) and "Scale PLU List" (what to program into the scale). Re-run with a higher `--start` for later batches so PLUs never repeat.
Current batch: `docs/weighing-scale/WS-scale-items-import.xlsx` — 31 "WS" items, PLU 10001–10031, barcodes SC10001–SC10031, UOM Kg.

## Still to do (owner: Nabeel unless noted)
1. **Fill FBR Tax Category** in the Item Import sheet — aimatic items need `custom_fbr_tax_category` (see `ipos_data_migration/create_s2_missing_items.py`); it is blank in the file.
2. Item Groups must already exist in ERP with exactly these names: Bajra, Basin-Maida & Suji, Pulses, Rice, Shakar & Gurh, Sugar.
3. Compare the sheet's column headers with ERP's own Data Import "Download Template" for Item (labels vary by version) and fix any that differ, then import.
4. Create **Item Price per Kg** for the POS price list, then sync the catalogue on each till. Without a price the till reports "Missing local item price" offline.
5. **Program the scale** (Nikasi; manual not found online): EAN-13, prefix 20, item/PLU 5 digits, weight 5 digits in grams, check digit last; PLU = the "PLU" column of the "Scale PLU List" sheet. If the scale offers a different layout, print one label and set the rule to match (Settings test box).
6. **Test on a till**: scan a label online and offline; wrong-check-digit label; non-weight UOM item; sale → ERP POS Invoice with decimal qty and FBR. The server (`aimatic`, read-only here) was not changed or tested for decimal quantity from a label: `submit_online_sale` resolves the item by `item_code`, so the POS sends the item code, not the label.
7. **Known gap (not done):** the cart's quantity +/- keys step by 1, which is wrong for a 1.250 Kg line. Quantity can still be edited with the quantity dialog.
8. Decide later whether scale rules should live in ERP (POS Profile) instead of per till — needs an `aimatic` change.

## Gift voucher question (shift summary print)
The printed shift summary (`buildShiftSummaryHtml()`) has no "Claimed Gift Vouchers" line. It prints Opening, Sales, Refunds, Expected, Actual, Difference, "Amount Received by Mode" and "Difference by mode". A gift voucher redemption is its own payment row on the POS Invoice (server comment in `offline_pos/api.py`), so it appears there only as a payment mode name, if the server includes it. Adding a dedicated line needs a server-side total.
