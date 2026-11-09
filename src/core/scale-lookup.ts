import { DEFAULT_SCALE_RULES, normalizeScaleRules, parseScaleBarcode, scaleQuantity, type ScaleRule } from "../domain/weighted-barcode";
import type { CatalogSearchResult } from "../db/database";

export const SCALE_RULES_META_KEY = "scale_rules_v1";
/** Rules from ERP Weighing Scale Settings; "" = ERP does not manage them, the till's own rules apply. */
export const SCALE_RULES_ERP_META_KEY = "scale_rules_erp_v1";

interface ScaleLookupDb {
  getMeta(key: string): string | null;
  lookupCatalog(query: string, warehouse: string, priceList: string): { exact: CatalogSearchResult | null; results: CatalogSearchResult[] };
}

export type CatalogLookup = { exact: CatalogSearchResult | null; results: CatalogSearchResult[]; scaleError?: string };

function erpScaleRules(db: Pick<ScaleLookupDb, "getMeta">): ScaleRule[] | null {
  const raw = db.getMeta(SCALE_RULES_ERP_META_KEY);
  if (!raw) return null;
  try {
    const result = normalizeScaleRules(JSON.parse(raw));
    return result.error ? null : result.rules;
  } catch { return null; }
}

/** True when the rules come from ERP and the till's rule editor must be read-only. */
export function scaleRulesManagedByErp(db: Pick<ScaleLookupDb, "getMeta">): boolean {
  return erpScaleRules(db) !== null;
}

/**
 * Store the get_weighing_scale_rules response. Only an explicit managed=false clears the ERP
 * rules; a bad payload is ignored so the till keeps the last good rules (offline-safe).
 */
export function applyErpScaleRules(db: { setMeta(key: string, value: string): void }, payload: unknown): { applied: boolean; error: string | null } {
  const message = (payload ?? {}) as Record<string, unknown>;
  if (message.managed === false) { db.setMeta(SCALE_RULES_ERP_META_KEY, ""); return { applied: true, error: null }; }
  if (message.managed !== true) return { applied: false, error: "Unexpected weighing scale rules response." };
  const result = normalizeScaleRules(message.rules);
  if (result.error || !result.rules.length) return { applied: false, error: result.error ?? "ERP weighing scale rules are empty." };
  db.setMeta(SCALE_RULES_ERP_META_KEY, JSON.stringify(result.rules));
  return { applied: true, error: null };
}

/** ERP rules when managed, else this till's saved rules, else the default EAN-13 layout. Never throws. */
export function loadScaleRules(db: Pick<ScaleLookupDb, "getMeta">): ScaleRule[] {
  const erp = erpScaleRules(db);
  if (erp) return erp;
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
  const item = db.lookupCatalog(parsed.lookupKey, warehouse, priceList).exact;
  if (!item) return { exact: null, results: [], scaleError: `Scale label item ${parsed.lookupKey} was not found in the catalogue (Item Barcode must be exactly "${parsed.lookupKey}"). Sync the catalogue or check the item.` };
  const qty = scaleQuantity(parsed, item.uom, item.sellingPrice);
  if (qty.error) return { exact: null, results: [], scaleError: `${item.itemName}: ${qty.error}` };
  return { exact: { ...item, scaleQuantity: qty.quantity, scaleLabel: query }, results: [] };
}
