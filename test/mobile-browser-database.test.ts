import assert from "node:assert/strict";
import test from "node:test";

test("Android catalogue lookup is indexed and cart saves exclude the large catalogue blob", async () => {
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
    items: [{ name: "ITEM-1", item_name: "Indexed item", stock_uom: "Nos", is_sales_item: 1, disabled: 0 }],
    prices: [{ name: "PRICE-1", item_code: "ITEM-1", uom: "Nos", price_list_rate: 125, currency: "PKR" }],
    stock: [{ item_code: "ITEM-1", warehouse: "STORE - TC", actual_qty: 7 }],
    barcodes: [{ item_code: "ITEM-1", barcode: "123456789", uom: "Nos" }],
    conversions: [{ item_code: "ITEM-1", uom: "Nos", conversion_factor: 1 }],
    totals: { items: 1, prices: 1, barcodes: 1, stockRows: 1, lastSynced: "2026-07-15T00:00:00Z" },
    replaceBarcodes: true,
    replaceConversions: true
  });

  const lookup = mobileDatabase.lookupCatalog("123456789", "STORE - TC");
  assert.equal(lookup.exact?.itemCode, "ITEM-1");
  assert.equal(lookup.exact?.sellingPrice, 125);
  mobileDatabase.saveCartState("hardware", "opening", [{ itemCode: "ITEM-1", quantity: 1 }]);

  const operational = JSON.parse(values.get("aimatic-pos-mobile") ?? "{}") as Record<string, unknown>;
  const catalogue = JSON.parse(values.get("aimatic-pos-mobile-catalog") ?? "{}") as Record<string, unknown>;
  assert.equal("items" in operational, false);
  assert.equal("barcodes" in operational, false);
  assert.equal(Object.keys(catalogue.items as object).length, 1);
});
