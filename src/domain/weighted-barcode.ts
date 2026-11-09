/**
 * Price-computing / label scale barcodes ("variable measure" labels).
 *
 * A scale prints  <prefix><item code><weight|price|count>[<check digit>]  e.g.
 * 20 12345 01250 3  ->  item key "12345", 1.250 kg. Every scale/brand lays this out
 * differently, so the layout is configuration, not code: one ScaleRule per layout.
 * Pure (no Electron/SQLite) so it is unit-tested directly.
 */
export interface ScaleRule {
  name: string;
  /** Leading digits that mark a scale label, e.g. "20" or "2". May be empty. */
  prefix: string;
  /** Digits that identify the item (the PLU / item key). */
  itemLength: number;
  /** Digits that carry the measured value. */
  valueLength: number;
  /** What the value digits mean. */
  kind: "weight" | "price" | "count";
  /** Weight unit the digits are written in (ignored for price/count). */
  unit: "g" | "kg";
  /** Implied decimal places in the value digits (g: 0 -> 01250 = 1250 g; kg: 3 -> 01.250). */
  decimals: number;
  /** Trailing EAN/UPC check digit over the whole label. */
  checkDigit: boolean;
  /**
   * Letters added in front of the item digits to find the item in ERP: the Item Barcode is stored
   * as lookupPrefix + item digits (e.g. "SC29111"). Real barcodes are all digits, so a scale item
   * can never be confused with an ordinary item that happens to own the barcode "29111".
   */
  lookupPrefix: string;
}

export interface ParsedScaleBarcode { rule: ScaleRule; /** digits on the label */ itemKey: string; /** what to search ERP for: rule.lookupPrefix + itemKey */ lookupKey: string; value: number; }

export const DEFAULT_SCALE_RULES: ScaleRule[] = [
  { name: "Weight label (EAN-13: 20 + 5 item + 5 grams + check)", prefix: "20", itemLength: 5, valueLength: 5, kind: "weight", unit: "g", decimals: 0, checkDigit: true, lookupPrefix: "SC" }
];

export function ruleLength(rule: ScaleRule): number {
  return rule.prefix.length + rule.itemLength + rule.valueLength + (rule.checkDigit ? 1 : 0);
}

/** EAN/UPC mod-10 check digit for the digits before the check position. */
export function eanCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const digit = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function normalizeScaleRules(input: unknown): { rules: ScaleRule[]; error: string | null } {
  if (!Array.isArray(input)) return { rules: [], error: "Rules must be a list." };
  const rules: ScaleRule[] = [];
  for (const [index, raw] of input.entries()) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const label = `Rule ${index + 1}`;
    const prefix = String(row.prefix ?? "").trim();
    const itemLength = Number(row.itemLength);
    const valueLength = Number(row.valueLength);
    const decimals = Number(row.decimals ?? 0);
    const kind = String(row.kind ?? "weight");
    const unit = String(row.unit ?? "g");
    if (!/^\d{0,6}$/.test(prefix)) return { rules, error: `${label}: prefix must be 0-6 digits.` };
    if (!Number.isInteger(itemLength) || itemLength < 1 || itemLength > 10) return { rules, error: `${label}: item digits must be 1-10.` };
    if (!Number.isInteger(valueLength) || valueLength < 1 || valueLength > 10) return { rules, error: `${label}: value digits must be 1-10.` };
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > valueLength) return { rules, error: `${label}: decimals must be 0-${valueLength}.` };
    if (!["weight", "price", "count"].includes(kind)) return { rules, error: `${label}: type must be weight, price or count.` };
    if (!["g", "kg"].includes(unit)) return { rules, error: `${label}: unit must be g or kg.` };
    const lookupPrefix = String(row.lookupPrefix ?? "").trim();
    if (!/^[A-Za-z0-9-]{0,8}$/.test(lookupPrefix)) return { rules, error: `${label}: lookup prefix may only have letters, numbers or "-" (max 8).` };
    const rule: ScaleRule = { lookupPrefix, name: String(row.name ?? "").trim() || label, prefix, itemLength, valueLength, kind: kind as ScaleRule["kind"], unit: unit as ScaleRule["unit"], decimals, checkDigit: row.checkDigit === true };
    if (ruleLength(rule) > 20) return { rules, error: `${label}: total label length is over 20 digits.` };
    rules.push(rule);
  }
  // Two rules that can match the same label would make the item ambiguous.
  for (let a = 0; a < rules.length; a += 1) for (let b = a + 1; b < rules.length; b += 1) {
    if (ruleLength(rules[a]) === ruleLength(rules[b]) && (rules[a].prefix.startsWith(rules[b].prefix) || rules[b].prefix.startsWith(rules[a].prefix))) {
      return { rules, error: `Rules ${a + 1} and ${b + 1} would both match the same labels (same length and overlapping prefix).` };
    }
  }
  return { rules, error: null };
}

/**
 * Split a scanned label with the first matching rule. null = not a scale label;
 * { error } = it matched a layout but the check digit is wrong (never guess a weight).
 */
export function parseScaleBarcode(raw: string, rules: ScaleRule[]): ParsedScaleBarcode | { error: string } | null {
  const code = String(raw ?? "").trim();
  if (!/^\d+$/.test(code)) return null;
  for (const rule of rules) {
    if (code.length !== ruleLength(rule) || !code.startsWith(rule.prefix)) continue;
    if (rule.checkDigit && eanCheckDigit(code.slice(0, -1)) !== Number(code[code.length - 1])) {
      return { error: `Scale label check digit is wrong (${code}). Scan the label again.` };
    }
    const itemStart = rule.prefix.length;
    const valueStart = itemStart + rule.itemLength;
    const itemKey = code.slice(itemStart, valueStart);
    const value = Number(code.slice(valueStart, valueStart + rule.valueLength)) / 10 ** rule.decimals;
    return { rule, itemKey, lookupKey: `${rule.lookupPrefix}${itemKey}`, value };
  }
  return null;
}

const KG_UOMS = new Set(["kg", "kgs", "kilogram", "kilograms", "kilo"]);
const GRAM_UOMS = new Set(["g", "gm", "gms", "gram", "grams", "gr"]);

/** Cart quantity (in the item's own UOM) for a parsed label; error text when it cannot be derived safely. */
export function scaleQuantity(parsed: ParsedScaleBarcode, itemUom: string, unitPrice: number | null): { quantity: number; error: string | null } {
  const { rule, value } = parsed;
  const uom = String(itemUom ?? "").trim().toLowerCase();
  let quantity: number;
  if (rule.kind === "count") {
    quantity = value;
  } else if (rule.kind === "weight") {
    const kg = rule.unit === "g" ? value / 1000 : value;
    if (KG_UOMS.has(uom)) quantity = kg;
    else if (GRAM_UOMS.has(uom)) quantity = kg * 1000;
    else return { quantity: 0, error: `Item UOM is "${itemUom}", not a weight unit (Kg/Gram), so the scale weight cannot be used.` };
  } else {
    if (!unitPrice || unitPrice <= 0) return { quantity: 0, error: "This label carries a price but the item has no selling price to convert it to a quantity." };
    quantity = value / unitPrice;
  }
  quantity = Math.round(quantity * 1000) / 1000;
  return quantity > 0 ? { quantity, error: null } : { quantity: 0, error: "Scale label has zero weight." };
}
