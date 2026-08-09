import assert from "node:assert/strict";
import test from "node:test";
import { barcodeVariants } from "../src/core/barcode-variants";

test("barcodeVariants adds EAN-13 leading-zero / UPC-A padding forms", () => {
  const upc = "671866150071";
  const variants = new Set(barcodeVariants(upc));
  assert.ok(variants.has(upc));
  assert.ok(variants.has(`0${upc}`));
  assert.ok(variants.has(upc.padStart(13, "0")));
});

test("barcodeVariants strips a single leading zero from EAN-13 scans", () => {
  const ean = "0671866150071";
  const variants = new Set(barcodeVariants(ean));
  assert.ok(variants.has(ean));
  assert.ok(variants.has("671866150071"));
  assert.ok(variants.has(ean.slice(1)));
});

test("Android catalogue lookup resolves GTIN padding variants", async () => {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; }
  } satisfies Storage;
  Object.defineProperty(globalThis, "localStorage", { value: localStorage, configurable: true });

  const { mobileDatabase } = await import("../src/mobile/browser-database");
  mobileDatabase.upsertCatalog({
    items: [{ name: "ITEM-UPC", item_name: "UPC item", stock_uom: "Nos", is_sales_item: 1, disabled: 0 }],
    prices: [{ name: "PRICE-UPC", item_code: "ITEM-UPC", uom: "Nos", price_list_rate: 50, currency: "PKR" }],
    stock: [{ item_code: "ITEM-UPC", warehouse: "STORE - TC", actual_qty: 3 }],
    barcodes: [{ item_code: "ITEM-UPC", barcode: "671866150071", uom: "Nos" }],
    conversions: [{ item_code: "ITEM-UPC", uom: "Nos", conversion_factor: 1 }],
    totals: { items: 1, prices: 1, barcodes: 1, stockRows: 1, lastSynced: "2026-08-07T00:00:00Z" },
    replaceBarcodes: true,
    replaceConversions: true,
    priceList: "Standard Selling"
  });

  const exact = mobileDatabase.lookupCatalog("671866150071", "STORE - TC", "Standard Selling");
  assert.equal(exact.exact?.itemCode, "ITEM-UPC");

  const padded = mobileDatabase.lookupCatalog("0671866150071", "STORE - TC", "Standard Selling");
  assert.equal(padded.exact?.itemCode, "ITEM-UPC");
  assert.equal(padded.exact?.sellingPrice, 50);
});
