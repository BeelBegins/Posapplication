import type { PosCoreDeps } from "./types";
import type { createHttpCore } from "./http";
import { asRecord, textValue, getResponseError } from "./http";
import { authFetch, hasUsableCredentials } from "./auth-fetch";
import { calculateFbrInvoice, calculateFbrItem } from "../domain/fbr-calculation";

type FbrCalculatedRow =
  | { success: true; item_code: string; quantity: number; inclusiveAmount: number; taxRate: number; salesTax: number; valueExcludingTax: number; retailPrice: number; isThirdSchedule: boolean }
  | { success: false; item_code: string; error: string };

function isSuccessfulFbrRow(row: FbrCalculatedRow): row is Extract<FbrCalculatedRow, { success: true }> {
  return row.success === true;
}

/**
 * Catalog/customer/FBR-config sync + local FBR cart estimate. Depends on the already-bound
 * http core (for fetchPagedList/fetchErpResource) so pagination/request logic isn't duplicated.
 */
export function createCatalogSyncCore(deps: PosCoreDeps, http: ReturnType<typeof createHttpCore>) {
  // Highest `modified` value across the given row groups — used as the next delta watermark
  // (server-basis, so it is immune to client clock skew). Returns "" when there are no rows.
  function maxModified(...rowGroups: Record<string, unknown>[][]): string {
    let max = "";
    for (const rows of rowGroups) for (const row of rows) { const m = textValue(row, "modified"); if (m > max) max = m; }
    return max;
  }

  // A full sync is due when its last-full timestamp is missing or older than 24h.
  function isFullDue(lastFullKey: string): boolean {
    const last = deps.db.getMeta(lastFullKey);
    if (!last) return true;
    const t = new Date(last).getTime();
    return Number.isNaN(t) || (Date.now() - t) > 24 * 60 * 60 * 1000;
  }

  async function fetchItemBarcodePages(baseUrl: string, sendProgress: (message: string) => void, modifiedAfter?: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; ; start += 500) {
      const query = new URLSearchParams({ limit_start: String(start), limit_page_length: "500" });
      if (modifiedAfter) query.set("modified_after", modifiedAfter);
      const response = await authFetch(deps, `${baseUrl}/api/method/aimatic.offline_pos.api.get_item_barcodes?${query.toString()}`);
      if (!response.ok) throw new Error(await getResponseError(response));
      const body = await response.json() as { message?: { rows?: unknown; has_more?: unknown } };
      const page = Array.isArray(body.message?.rows)
        ? body.message.rows.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row))
        : [];
      rows.push(...page);
      sendProgress(`Barcodes: ${rows.length}`);
      if (!body.message?.has_more) return rows;
    }
  }

  // UOM conversions via custom method (the POS user can't read the UOM Conversion Detail child doctype
  // over /api/resource). Supports delta via modified_after, paginated by next_start/has_more.
  async function fetchUomConversionPages(baseUrl: string, modifiedAfter?: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    let start = 0;
    for (;;) {
      const query = new URLSearchParams({ limit_start: String(start), limit_page_length: "500" });
      if (modifiedAfter) query.set("modified_after", modifiedAfter);
      const response = await authFetch(deps, `${baseUrl}/api/method/aimatic.offline_pos.api.get_uom_conversions?${query.toString()}`);
      if (!response.ok) throw new Error(await getResponseError(response));
      const body = await response.json() as { message?: { rows?: unknown; has_more?: unknown; next_start?: unknown } };
      const page = Array.isArray(body.message?.rows) ? body.message.rows.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row)) : [];
      rows.push(...page);
      if (!body.message?.has_more) return rows;
      start = typeof body.message?.next_start === "number" ? body.message.next_start : start + 500;
    }
  }

  async function syncCustomers(mode: "auto" | "full" = "auto"): Promise<{ success: boolean; state: ReturnType<typeof deps.db.getCustomerSyncState>; error: string | null }> {
    const settings = deps.db.loadSettings();
    if (!hasUsableCredentials(deps, settings) || !settings.erpnextUrl) return { success: false, state: deps.db.getCustomerSyncState(), error: "ERPNext URL and API credentials are required." };
    try {
      const base = new URL(settings.erpnextUrl).toString().replace(/\/+$/, "");
      const cursor = deps.db.getMeta("customers_last_sync") ?? "";
      const doFull = mode === "full" || !cursor || isFullDue("customers_last_full_sync");
      const filters = doFull ? [["disabled", "=", 0]] : [["disabled", "=", 0], ["modified", ">", cursor]];
      const customers = await http.fetchPagedList(base, "Customer", ["name", "customer_name", "customer_group", "territory", "mobile_no", "email_id", "tax_id", "disabled", "modified"], filters);
      deps.db.upsertCustomers(customers);
      const wm = maxModified(customers); if (wm) deps.db.setMeta("customers_last_sync", wm);
      if (doFull) deps.db.setMeta("customers_last_full_sync", new Date().toISOString());
      return { success: true, state: deps.db.getCustomerSyncState(), error: null };
    } catch (error) { return { success: false, state: deps.db.getCustomerSyncState(), error: error instanceof Error ? error.message : "Customer sync failed." }; }
  }

  async function loadCustomer(name: string): Promise<{ customer: Record<string, unknown> | null; cached: boolean; error: string | null }> {
    const settings = deps.db.loadSettings();
    const cached = deps.db.getCachedCustomer(name);
    if (!hasUsableCredentials(deps, settings) || !settings.erpnextUrl) return { customer: cached, cached: true, error: cached ? null : "Customer not cached." };
    try {
      const base = new URL(settings.erpnextUrl).toString().replace(/\/+$/, "");
      const customer = await http.fetchErpResource(base, "Customer", name);
      deps.db.cacheCustomer(name, customer);
      return { customer, cached: false, error: null };
    } catch (error) { return { customer: cached, cached: true, error: error instanceof Error ? error.message : "Unable to load customer." }; }
  }

  async function getCustomerCreationOptions(): Promise<{ groups: string[]; territories: string[]; error: string | null }> {
    const settings = deps.db.loadSettings();
    if (!hasUsableCredentials(deps, settings) || !settings.erpnextUrl) return { groups: [], territories: [], error: "Online connection required to create a customer." };
    try {
      const base = new URL(settings.erpnextUrl).toString().replace(/\/+$/, "");
      const [groups, territories] = await Promise.all([
        http.fetchPagedList(base, "Customer Group", ["name"], [["is_group", "=", 0]]),
        http.fetchPagedList(base, "Territory", ["name"], [["is_group", "=", 0]])
      ]);
      return { groups: groups.map((x) => textValue(x, "name")).filter(Boolean), territories: territories.map((x) => textValue(x, "name")).filter(Boolean), error: null };
    } catch (error) { return { groups: [], territories: [], error: error instanceof Error ? error.message : "Unable to load customer options." }; }
  }

  async function createCustomer(input: Record<string, unknown>): Promise<{ customer: Record<string, unknown> | null; error: string | null }> {
    const settings = deps.db.loadSettings();
    if (!hasUsableCredentials(deps, settings) || !settings.erpnextUrl) return { customer: null, error: "Online connection required to create a customer." };
    try {
      const base = new URL(settings.erpnextUrl).toString().replace(/\/+$/, "");
      const rawMobile = String(input.mobile_no ?? "").trim();
      const digits = rawMobile.replace(/\D/g, "");
      const mobileNo = !digits ? "" : digits.startsWith("92") ? `+${digits}` : digits.startsWith("0") ? `+92${digits.slice(1)}` : digits.length === 10 && digits.startsWith("3") ? `+92${digits}` : rawMobile;
      const existing = mobileNo ? deps.db.findCustomerByNormalizedMobile(mobileNo) : null;
      if (existing) return { customer: null, error: `Mobile number already exists for Customer: ${textValue(existing, "name")}` };
      const profile = asRecord(deps.db.getPosBootstrap(settings.posProfile)?.pos_profile);
      const priceList = textValue(profile, "selling_price_list");
      const payload: Record<string, string> = {
        customer_name: String(input.customer_name ?? ""), customer_type: "Individual", customer_group: String(input.customer_group ?? ""),
        territory: String(input.territory ?? ""), mobile_no: mobileNo, email_id: String(input.email_id ?? ""), tax_id: String(input.tax_id ?? "")
      };
      if (priceList) payload.default_price_list = priceList;
      if (!payload.customer_name) return { customer: null, error: "Customer Name is required." };
      const response = await authFetch(deps, `${base}/api/resource/Customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const message = await getResponseError(response);
        return { customer: null, error: /mobile/i.test(message) && /duplicate|already|exists/i.test(message) ? `Duplicate mobile number: ${message}` : message };
      }
      const body = await response.json() as { data?: unknown };
      const customer = asRecord(body.data);
      if (!customer) return { customer: null, error: "ERPNext returned no Customer document." };
      deps.db.cacheCustomer(textValue(customer, "name"), customer);
      deps.db.upsertCustomers([customer]);
      return { customer, error: null };
    } catch (error) { return { customer: null, error: error instanceof Error ? error.message : "Unable to create customer." }; }
  }

  // mode "full" = manual refresh / first run / 24h cadence → DELETE+INSERT for barcodes & conversions.
  // mode "auto" with an existing watermark → delta: fetch only `modified > watermark` rows and UPSERT.
  async function syncItemCatalog(sendProgress: (message: string) => void, mode: "auto" | "full" = "auto"): Promise<{ success: boolean; totals: ReturnType<typeof deps.db.getCatalogTotals>; barcodeError: string | null; error: string | null }> {
    const settings = deps.db.loadSettings();
    const bootstrap = deps.db.getPosBootstrap(settings.posProfile);
    const profile = asRecord(bootstrap?.pos_profile);
    const priceList = textValue(profile, "selling_price_list");
    const warehouse = textValue(profile, "warehouse");
    const currency = textValue(profile, "currency");
    if (!hasUsableCredentials(deps, settings) || !settings.erpnextUrl || !priceList || !warehouse || !currency) {
      return { success: false, totals: deps.db.getCatalogTotals(), barcodeError: null, error: "Cached POS Profile configuration is required." };
    }
    const itemsCursor = deps.db.getMeta("items_last_sync") ?? "";
    const barcodesCursor = deps.db.getMeta("barcodes_last_sync") ?? "";
    const doFull = mode === "full" || !itemsCursor || isFullDue("items_last_full_sync");
    const since = (base: unknown[]): unknown[] => doFull ? base : [...base, ["modified", ">", itemsCursor]];
    try {
      const baseUrl = new URL(settings.erpnextUrl).toString().replace(/\/+$/, "");
      sendProgress(doFull ? "Full sync: items..." : "Delta sync: items...");
      const items = await http.fetchPagedList(baseUrl, "Item", ["name", "item_name", "item_group", "stock_uom", "is_stock_item", "is_sales_item", "disabled", "has_batch_no", "has_serial_no", "modified"], doFull ? undefined : [["modified", ">", itemsCursor]]);
      sendProgress(`Items: ${items.length}. Syncing prices...`);
      const prices = await http.fetchPagedList(baseUrl, "Item Price", ["name", "item_code", "uom", "price_list_rate", "currency", "valid_from", "valid_upto", "modified"], since([["price_list", "=", priceList], ["selling", "=", 1]]));
      sendProgress(`Prices: ${prices.length}. Syncing stock...`);
      const stock = await http.fetchPagedList(baseUrl, "Bin", ["item_code", "warehouse", "actual_qty", "reserved_qty", "projected_qty", "modified"], since([["warehouse", "=", warehouse]]));
      let conversions: Record<string, unknown>[] = [];
      let conversionError: string | null = null;
      try {
        sendProgress("Syncing UOM conversions...");
        conversions = await fetchUomConversionPages(baseUrl, doFull ? undefined : (itemsCursor || undefined));
      } catch (error) {
        conversionError = error instanceof Error ? error.message : "Unable to sync UOM conversions.";
      }
      let barcodes: Record<string, unknown>[] = [];
      let barcodeError: string | null = null;
      try {
        sendProgress("Syncing barcodes...");
        barcodes = await fetchItemBarcodePages(baseUrl, sendProgress, doFull ? undefined : (barcodesCursor || undefined));
      } catch (error) {
        barcodeError = error instanceof Error ? error.message : "Unable to sync Item Barcode.";
      }
      const totals = { items: items.length, prices: prices.length, barcodes: barcodes.length, stockRows: stock.length, lastSynced: new Date().toISOString() };
      // Full → DELETE+INSERT (replace) for barcodes/conversions; delta → UPSERT only (no destructive replace).
      deps.db.upsertCatalog({ items, prices, stock, barcodes, conversions, totals, replaceBarcodes: doFull && !barcodeError, replaceConversions: doFull && !conversionError });
      // Advance watermarks from the server-provided max(modified) — never regress on an empty delta or a failed fetch.
      const itemsWatermark = maxModified(items, prices, stock, conversionError ? [] : conversions);
      if (itemsWatermark) deps.db.setMeta("items_last_sync", itemsWatermark);
      if (!barcodeError) { const bw = maxModified(barcodes); if (bw) deps.db.setMeta("barcodes_last_sync", bw); }
      if (doFull) deps.db.setMeta("items_last_full_sync", new Date().toISOString());
      sendProgress("Catalog sync complete.");
      return { success: true, totals: deps.db.getCatalogTotals(), barcodeError: [barcodeError, conversionError].filter(Boolean).join(" | ") || null, error: null };
    } catch (error) {
      return { success: false, totals: deps.db.getCatalogTotals(), barcodeError: null, error: error instanceof Error ? error.message : "Catalog sync failed." };
    }
  }

  async function syncFbrConfig(mode: "auto" | "full" = "auto"): Promise<{ success: boolean; state: ReturnType<typeof deps.db.getFbrSyncState>; error: string | null }> {
    const settings = deps.db.loadSettings();
    if (!hasUsableCredentials(deps, settings) || !settings.erpnextUrl) return { success: false, state: deps.db.getFbrSyncState(), error: "Online connection required for FBR configuration sync." };
    try {
      const base = new URL(settings.erpnextUrl).toString().replace(/\/+$/, "");
      const cursor = deps.db.getMeta("fbr_config_last_sync") ?? "";
      const doFull = mode === "full" || !cursor || isFullDue("fbr_config_last_full_sync");
      let start = 0;
      let fee = 0;
      const rows: Record<string, unknown>[] = [];
      for (;;) {
        const q = new URLSearchParams({ limit_start: String(start), limit_page_length: "500" });
        if (!doFull && cursor) q.set("modified_after", cursor);
        const r = await authFetch(deps, `${base}/api/method/aimatic.offline_pos.api.get_pos_fbr_item_config?${q}`);
        if (!r.ok) throw new Error(await getResponseError(r));
        const b = await r.json() as { message?: unknown };
        const m = asRecord(b.message);
        const page = Array.isArray(m?.rows) ? m.rows.map(asRecord).filter((x): x is Record<string, unknown> => x !== null && typeof x.item_code === "string") : [];
        rows.push(...page);
        if (typeof m?.service_fee === "number") fee = m.service_fee;
        if (!m?.has_more) break;
        start = typeof m?.next_start === "number" ? m.next_start : start + 500;
      }
      deps.db.upsertFbrItemConfig(rows, fee);
      const wm = maxModified(rows);
      if (wm) deps.db.setMeta("fbr_config_last_sync", wm);
      if (doFull) deps.db.setMeta("fbr_config_last_full_sync", new Date().toISOString());
      return { success: true, state: deps.db.getFbrSyncState(), error: null };
    } catch (e) { return { success: false, state: deps.db.getFbrSyncState(), error: e instanceof Error ? e.message : "FBR configuration sync failed." }; }
  }

  function calculateFbrCart(input: Record<string, unknown>): Record<string, unknown> {
    const items = Array.isArray(input.items) ? input.items.map(asRecord).filter((x): x is Record<string, unknown> => x !== null) : [];
    const configs = deps.db.getFbrItemConfigs(items.map((x) => String(x.item_code ?? "")));
    const state = deps.db.getFbrSyncState();
    const rows: FbrCalculatedRow[] = items.map((item) => {
      const code = String(item.item_code ?? "");
      const c = configs[code];
      if (!c) return { success: false, item_code: code, error: `FBR Tax Category is missing for ${code}` };
      if (c.enabled === 0) return { success: false, item_code: code, error: `FBR Tax Category is disabled for ${code}` };
      try {
        const result = calculateFbrItem({
          itemCode: code, qty: Number(item.qty) || 0, rate: Number(item.rate) || 0, amount: Number(item.amount) || undefined,
          taxRate: Number(c.tax_rate) || 0, isExempt: Boolean(c.is_exempt), isZeroRated: Boolean(c.is_zero_rated),
          isThirdSchedule: Boolean(c.is_third_schedule || c.custom_is_3rd_schedule),
          mrp: Number(c.custom_mrp) ? Number(c.custom_mrp) * (Number(item.conversion_factor) || 1) : undefined,
          taxCategory: String(c.custom_fbr_tax_category || ""), hsCode: String(c.custom_fbr_hs_code || "")
        });
        return { success: true, item_code: code, quantity: result.quantity, inclusiveAmount: result.inclusiveAmount, taxRate: result.taxRate, salesTax: result.salesTax, valueExcludingTax: result.valueExcludingTax, retailPrice: result.retailPrice, isThirdSchedule: result.isThirdSchedule };
      } catch (e) { return { success: false, item_code: code, error: e instanceof Error ? e.message : "FBR calculation failed" }; }
    });
    const validRows = rows.filter(isSuccessfulFbrRow);
    const valid = validRows.map((r) => ({
      itemCode: r.item_code, qty: r.quantity, rate: Number((items.find((i) => String(i.item_code) === r.item_code)?.rate) || 0),
      amount: r.inclusiveAmount, taxRate: r.taxRate, isThirdSchedule: r.isThirdSchedule, mrp: r.retailPrice / (r.quantity || 1)
    }));
    const totals = calculateFbrInvoice(valid, state.serviceFee);
    const errorRows = rows.filter((row): row is Extract<FbrCalculatedRow, { success: false }> => row.success === false);
    return { success: true, rows, totals, errors: errorRows.map((row) => row.error) };
  }

  return { syncCustomers, loadCustomer, getCustomerCreationOptions, createCustomer, syncItemCatalog, syncFbrConfig, calculateFbrCart };
}
