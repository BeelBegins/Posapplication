#!/usr/bin/env python3
"""Build an ERP Item import workbook for weighing-scale (loose / by-weight) items.

Input : CSV or XLSX with columns  Description, Type, Sub Category   (SKU Code ignored/blank)
Output: XLSX with sheets
  "Item Import"   -> ERP Data Import (Item). ID is left blank so ERP assigns item_code from its
                     default naming series. The scale PLU is stored as the item's Barcode (Stock UOM).
  "Scale PLU List"-> PLU, item name, group: what to program into the scale (same PLU as the barcode).

PLUs are sequential from --start (default 10001) with --digits digits, matching the POS
Settings -> Weighing scale rule's "Item digits". Re-run with a higher --start for later batches so
PLUs never repeat; --taken lists PLUs already used (one per line) to skip.

Usage: python3 scripts/generate-scale-items.py items.csv out.xlsx [--uom Kg] [--start 10001]
       [--digits 5] [--tax-category "..."] [--taken used_plus.txt]
Needs: pip install openpyxl
"""
import argparse, csv, sys
from openpyxl import Workbook, load_workbook


def read_rows(path):
    if path.lower().endswith((".xlsx", ".xlsm")):
        sheet = load_workbook(path, read_only=True, data_only=True).active
        rows = [[("" if c is None else str(c).strip()) for c in r] for r in sheet.iter_rows(values_only=True)]
    else:
        with open(path, newline="", encoding="utf-8-sig") as f:
            rows = [[c.strip() for c in r] for r in csv.reader(f)]
    header = [h.lower() for h in rows[0]]
    def col(*names):
        for n in names:
            if n in header: return header.index(n)
        return None
    d, t, g = col("description", "item name", "name"), col("type", "tyep"), col("sub category", "sub cetegory", "item group")
    if d is None or g is None:
        sys.exit("Input needs a Description column and a Sub Category (item group) column.")
    out = []
    for r in rows[1:]:
        r = r + [""] * (len(header) - len(r))
        if r[d]: out.append((r[d], r[t] if t is not None else "", r[g]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input"); ap.add_argument("output")
    ap.add_argument("--uom", default="Kg"); ap.add_argument("--start", type=int, default=10001)
    ap.add_argument("--digits", type=int, default=5); ap.add_argument("--tax-category", default="")
    ap.add_argument("--taken", default="")
    a = ap.parse_args()
    taken = set()
    if a.taken:
        taken = {l.strip().lstrip("0") for l in open(a.taken) if l.strip()}
    items = read_rows(a.input)
    names = [n.lower() for n, _, _ in items]
    dup = {n for n in names if names.count(n) > 1}
    if dup: sys.exit(f"Duplicate item names in input: {sorted(dup)}")
    plus, n = [], a.start
    for _ in items:
        while str(n) in taken: n += 1
        if len(str(n)) > a.digits: sys.exit(f"Ran out of {a.digits}-digit PLUs at {n}.")
        plus.append(str(n).zfill(a.digits)); n += 1

    wb = Workbook(); ws = wb.active; ws.title = "Item Import"
    # Column labels follow ERP's Data Import template ("Label (Child Table)"). If your ERP version
    # words one differently, download its Item template and paste these columns under its headers.
    ws.append(["ID", "Item Name", "Item Group", "Default Unit of Measure", "Maintain Stock", "Allow Sales",
               "Description", "FBR Tax Category", "Barcode (Barcodes)", "UOM (Barcodes)"])
    for (name, typ, grp), plu in zip(items, plus):
        ws.append(["", name, grp, a.uom, 1, 1, typ or name, a.tax_category, plu, a.uom])
    pl = wb.create_sheet("Scale PLU List")
    pl.append(["PLU", "Item Name", "Item Group", "Unit", "Price per unit (fill from ERP price list)"])
    for (name, _, grp), plu in zip(items, plus):
        pl.append([plu, name, grp, a.uom, ""])
    for sheet in (ws, pl):
        for column in sheet.columns:
            sheet.column_dimensions[column[0].column_letter].width = min(48, max(len(str(c.value or "")) for c in column) + 2)
    wb.save(a.output)
    print(f"{len(items)} items, PLU {plus[0]}..{plus[-1]} -> {a.output}")


if __name__ == "__main__":
    main()
