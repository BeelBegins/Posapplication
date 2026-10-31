import { DEFAULT_SCALE_RULES, normalizeScaleRules, parseScaleBarcode, scaleQuantity, type ScaleRule } from "../domain/weighted-barcode";
import type { CatalogSearchResult } from "../db/database";

export const SCALE_RULES_META_KEY = "scale_rules_v1";

interface ScaleLookupDb {
  getMeta(key: string): string | null;
  lookupCatalog(query: string, warehouse: string, priceList: string): { exact: CatalogSearchResult | null; results: CatalogSearchResult[] };
}

export type CatalogLookup = { exact: CatalogSearchResult | null; results: CatalogSearchResult[]; scaleError?: string };

/** Saved rules, or the default EAN-13 layout until the till is configured. Never throws. */
export function loadScaleRules(db: Pick<ScaleLookupDb, "getMeta">): ScaleRule[] {
  const raw = db.getMeta(SCALE_RULES_META_KEY);
  if (raw === null || raw === undefined) return DEFAULT_SCALE_RULES;
  try {
    const result = normalizeScaleRules(JSON.parse(raw));
    return result.error ? [] : result.rules;
  } catch { return []; }
}

/**
 * Normal lookup first (so a real item barcode that happens to start with 20 still wins); only a
 * miss is tried as a scale label. The item is found by its item key (Item Barcode or Item Code).
 */
export function lookupWithScale(db: ScaleLookupDb, query: string, warehouse: string, priceList: string): CatalogLookup {
  const normal = db.lookupCatalog(query, warehouse, priceList);
  if (normal.exact) return normal;
  const parsed = parseScaleBarcode(query, loadScaleRules(db));
  if (!parsed) return normal;
  if ("error" in parsed) return { exact: null, results: [], scaleError: parsed.error };
  const item = db.lookupCatalog(parsed.itemKey, warehouse, priceList).exact;
  if (!item) return { exact: null, results: [], scaleError: `Scale label item ${parsed.itemKey} was not found in the catalogue.` };
  const qty = scaleQuantity(parsed, item.uom, item.sellingPrice);
  if (qty.error) return { exact: null, results: [], scaleError: `${item.itemName}: ${qty.error}` };
  return { exact: { ...item, scaleQuantity: qty.quantity, scaleLabel: query }, results: [] };
}
