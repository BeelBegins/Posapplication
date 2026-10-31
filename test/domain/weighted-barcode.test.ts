import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCALE_RULES, eanCheckDigit, normalizeScaleRules, parseScaleBarcode, scaleQuantity, type ParsedScaleBarcode, type ScaleRule } from "../../src/domain/weighted-barcode";

const label = (body: string) => `${body}${eanCheckDigit(body)}`;

test("EAN-13 check digit matches a known barcode", () => {
  assert.equal(eanCheckDigit("400638133393"), 1);
});

test("default rule splits prefix, 5-digit item key and gram weight", () => {
  const parsed = parseScaleBarcode(label("201234501250"), DEFAULT_SCALE_RULES) as ParsedScaleBarcode;
  assert.equal(parsed.itemKey, "12345");
  assert.equal(parsed.value, 1250);
  assert.equal(scaleQuantity(parsed, "Kg", null).quantity, 1.25);
  assert.equal(scaleQuantity(parsed, "Gram", null).quantity, 1250);
});

test("kg-with-3-decimals layout reads the same label as 1.250 kg", () => {
  const rule: ScaleRule = { name: "kg", prefix: "20", itemLength: 5, valueLength: 5, kind: "weight", unit: "kg", decimals: 3, checkDigit: true, lookupPrefix: "" };
  const parsed = parseScaleBarcode(label("201234501250"), [rule]) as ParsedScaleBarcode;
  assert.equal(scaleQuantity(parsed, "KG", null).quantity, 1.25);
});

test("item key may be shorter or longer than 5 digits and prefix may be one digit", () => {
  const rule: ScaleRule = { name: "x", prefix: "2", itemLength: 6, valueLength: 5, kind: "weight", unit: "g", decimals: 0, checkDigit: true, lookupPrefix: "" };
  const parsed = parseScaleBarcode(label("200123400500"), [rule]) as ParsedScaleBarcode;
  assert.equal(parsed.itemKey, "001234");
  assert.equal(scaleQuantity(parsed, "Kg", null).quantity, 0.5);
});

test("wrong check digit is an error, not a guessed weight", () => {
  const good = label("201234501250");
  const bad = good.slice(0, -1) + String((Number(good.slice(-1)) + 1) % 10);
  assert.match((parseScaleBarcode(bad, DEFAULT_SCALE_RULES) as { error: string }).error, /check digit/);
});

test("ordinary barcodes and other lengths are not scale labels", () => {
  assert.equal(parseScaleBarcode("8901234567890", DEFAULT_SCALE_RULES), null);
  assert.equal(parseScaleBarcode("2012345", DEFAULT_SCALE_RULES), null);
  assert.equal(parseScaleBarcode("ABC", DEFAULT_SCALE_RULES), null);
});

test("price labels convert to a quantity from the unit price", () => {
  const rule: ScaleRule = { name: "p", prefix: "21", itemLength: 5, valueLength: 5, kind: "price", unit: "g", decimals: 0, checkDigit: false, lookupPrefix: "" };
  const parsed = parseScaleBarcode("211234500500", [rule]) as ParsedScaleBarcode;
  assert.equal(parsed.value, 500);
  assert.equal(scaleQuantity(parsed, "Kg", 250).quantity, 2);
  assert.match(scaleQuantity(parsed, "Kg", null).error ?? "", /no selling price/);
});

test("weight label on a non-weight UOM is refused", () => {
  const parsed = parseScaleBarcode(label("201234501250"), DEFAULT_SCALE_RULES) as ParsedScaleBarcode;
  assert.match(scaleQuantity(parsed, "Nos", null).error ?? "", /not a weight unit/);
});

test("normalizeScaleRules validates and rejects ambiguous rules", () => {
  assert.equal(normalizeScaleRules(DEFAULT_SCALE_RULES).error, null);
  assert.match(normalizeScaleRules([{ prefix: "x", itemLength: 5, valueLength: 5 }]).error ?? "", /prefix/);
  assert.match(normalizeScaleRules([{ prefix: "20", itemLength: 5, valueLength: 5, decimals: 9 }]).error ?? "", /decimals/);
  const a = { prefix: "20", itemLength: 5, valueLength: 5, checkDigit: true, lookupPrefix: "" };
  assert.match(normalizeScaleRules([a, { ...a, prefix: "2", itemLength: 6 }]).error ?? "", /same labels/);
});

import { lookupWithScale } from "../../src/core/scale-lookup";
import type { CatalogSearchResult } from "../../src/db/database";

const rice = { itemCode: "ITEM-0042", itemName: "WS SUGAR", barcode: "12345", uom: "Kg", conversionFactor: 1, sellingPrice: 160, currency: "PKR", actualStock: 50, warehouse: "W", mrp: null } as CatalogSearchResult;
const fakeDb = (meta: string | null, items: Record<string, CatalogSearchResult>) => ({
  getMeta: () => meta,
  lookupCatalog: (q: string) => ({ exact: items[q] ?? null, results: [] })
});

test("lookupWithScale turns a label into the item with a decimal quantity", () => {
  const r = lookupWithScale(fakeDb(null, { SC12345: rice }), label("201234501250"), "W", "PL");
  assert.equal(r.exact?.itemCode, "ITEM-0042");
  assert.equal(r.exact?.scaleQuantity, 1.25);
  assert.equal(r.scaleError, undefined);
});

test("a real item barcode that looks like a label wins over scale parsing", () => {
  const code = label("201234501250");
  const r = lookupWithScale(fakeDb(null, { [code]: rice }), code, "W", "PL");
  assert.equal(r.exact?.scaleQuantity, undefined);
});

test("unknown item key, bad UOM and corrupt saved rules give errors, not wrong lines", () => {
  assert.match(lookupWithScale(fakeDb(null, {}), label("201234501250"), "W", "PL").scaleError ?? "", /not found/);
  assert.match(lookupWithScale(fakeDb(null, { SC12345: { ...rice, uom: "Nos" } }), label("201234501250"), "W", "PL").scaleError ?? "", /weight unit/);
  assert.equal(lookupWithScale(fakeDb("{not json", { SC12345: rice }), label("201234501250"), "W", "PL").exact, null);
});

test("lookup prefix keeps scale items apart from an ordinary item that owns the same digits", () => {
  const other = { ...rice, itemCode: "ITEM-OTHER", itemName: "Biscuit" };
  const r = lookupWithScale(fakeDb(null, { "12345": other, SC12345: rice }), label("201234501250"), "W", "PL");
  assert.equal(r.exact?.itemCode, "ITEM-0042");
  assert.equal(parseScaleBarcode(label("201234501250"), DEFAULT_SCALE_RULES) !== null && (parseScaleBarcode(label("201234501250"), DEFAULT_SCALE_RULES) as ParsedScaleBarcode).lookupKey, "SC12345");
  assert.match(normalizeScaleRules([{ ...DEFAULT_SCALE_RULES[0], lookupPrefix: "S C!" }]).error ?? "", /lookup prefix/);
});
