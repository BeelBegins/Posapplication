import { app } from "electron";
import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface DatabaseStatus {
  isReady: boolean;
  path: string;
  schemaVersion: string | null;
}

export interface AppSettings {
  erpnextUrl: string;
  apiKey: string;
  apiSecret: string;
  terminalId: string;
  posProfile: string;
  branch: string;
  warehouse: string;
  receiptPrinter: string;
  colorTheme?: string;
}

export interface RendererSettings {
  erpnextUrl: string;
  apiKey: string;
  terminalId: string;
  posProfile: string;
  branch: string;
  warehouse: string;
  hasApiSecret: boolean;
  receiptPrinter: string;
  colorTheme: string;
}

export interface PosProfileCacheStatus {
  isReady: boolean;
  lastSynced: string | null;
}

export interface CatalogTotals {
  items: number;
  prices: number;
  barcodes: number;
  stockRows: number;
  lastSynced: string | null;
}

export interface CatalogSearchResult {
  itemCode: string;
  itemName: string;
  barcode: string | null;
  uom: string;
  conversionFactor: number;
  sellingPrice: number | null;
  currency: string | null;
  actualStock: number | null;
  warehouse: string | null;
  mrp: number | null;
}

export interface CartState { cartKey: string; lines: unknown[]; }

const settingKeys = ["erpnextUrl", "apiKey", "apiSecret", "terminalId", "posProfile", "branch", "warehouse", "receiptPrinter", "colorTheme"] as const;

let database: Database.Database | null = null;
let databasePath = "";

export function normalizeErpnextUrl(value: string): string {
  let cleaned = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "")
    .trim();
  if (!cleaned) return "";
  if (cleaned.startsWith("//")) cleaned = `https:${cleaned}`;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)) cleaned = `https://${cleaned}`;
  try {
    return new URL(cleaned).toString().replace(/\/+$/, "");
  } catch {
    return cleaned.replace(/\/+$/, "");
  }
}

// ----- Versioned schema migration runner -----
// Baseline schema (the CREATE TABLE IF NOT EXISTS block in initDatabase) is version 1.
// Each migration here advances the schema by exactly one version and runs at most once,
// in order, inside a transaction. A failing migration rolls back and throws (fatal at startup).
interface Migration { version: number; sql: string[]; }

const MIGRATIONS: Migration[] = [
  {
    // v2 — indexes on `modified` to support delta sync / change detection.
    // NOTE: `disabled` is intentionally NOT added to pos_items here — it already exists in the
    // baseline pos_items definition (re-adding it would throw "duplicate column name").
    version: 2,
    sql: [
      "CREATE INDEX IF NOT EXISTS idx_pos_items_modified ON pos_items(modified)",
      "CREATE INDEX IF NOT EXISTS idx_pos_customers_modified ON pos_customers(modified)",
      "CREATE INDEX IF NOT EXISTS idx_pos_item_barcodes_modified ON pos_item_barcodes(modified)"
    ]
  },
  {
    version: 3,
    sql: [
      "ALTER TABLE pos_refund_log ADD COLUMN mode_of_payment TEXT"
    ]
  }
];

function getSchemaVersion(): number {
  if (!database) return 0;
  const row = database.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
  return row ? Number(row.value) || 0 : 0;
}

function setSchemaVersion(version: number): void {
  if (!database) return;
  database.prepare("INSERT INTO app_meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(version));
}

// Generic app_meta accessors — used for delta-sync watermarks (e.g. items_last_sync) and full-sync timestamps.
export function getMeta(key: string): string | null {
  if (!database) return null;
  const row = database.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : null;
}
export function setMeta(key: string, value: string): void {
  if (!database) return;
  database.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

// Per-install, auto-generated device identifier — minted once and persisted in app_meta, never
// user-editable/shown. Distinct from settings.terminalId (a shared, server-derived label that
// multiple physical terminals assigned to the same POS Profile may have in common); this is the
// true per-machine uniqueness key for cart/offline-batch/open-invoice/offline-PIN local state.
export function getOrCreateHardwareId(): string {
  const existing = getMeta("hardware_id");
  if (existing) return existing;
  const id = randomUUID();
  setMeta("hardware_id", id);
  return id;
}

// Applies every migration with version > current, each in its own transaction.
// better-sqlite3's transaction() runs BEGIN/COMMIT and on any throw ROLLBACKs and re-throws.
function runMigrations(): void {
  if (!database) return;
  const current = getSchemaVersion();
  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (migration.version <= current) continue;
    const apply = database.transaction(() => {
      for (const statement of migration.sql) database!.exec(statement);
      setSchemaVersion(migration.version);
    });
    apply();
  }
}

export function initDatabase(): void {
  if (database) {
    return;
  }

  databasePath = path.join(app.getPath("userData"), "erpnext-offline-pos.sqlite");
  database = new Database(databasePath);

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS pos_profile_cache (
      name TEXT PRIMARY KEY,
      json_data TEXT NOT NULL,
      synced_at TEXT NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS pos_bootstrap_cache (
      pos_profile TEXT PRIMARY KEY,
      json_data TEXT NOT NULL,
      synced_at TEXT NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS pos_session_cache (
      opening_entry TEXT PRIMARY KEY,
      pos_profile TEXT NOT NULL,
      user TEXT NOT NULL,
      json_data TEXT NOT NULL,
      synced_at TEXT NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS pos_items (
      item_code TEXT PRIMARY KEY, item_name TEXT NOT NULL, item_group TEXT, stock_uom TEXT,
      is_stock_item INTEGER NOT NULL, is_sales_item INTEGER NOT NULL, disabled INTEGER NOT NULL,
      has_batch_no INTEGER NOT NULL, has_serial_no INTEGER NOT NULL, modified TEXT
    );
    CREATE TABLE IF NOT EXISTS pos_item_prices (
      name TEXT PRIMARY KEY, item_code TEXT NOT NULL, uom TEXT, price_list_rate REAL,
      currency TEXT, valid_from TEXT, valid_upto TEXT, modified TEXT
    );
    CREATE TABLE IF NOT EXISTS pos_item_stock (
      item_code TEXT NOT NULL, warehouse TEXT NOT NULL, actual_qty REAL, reserved_qty REAL,
      projected_qty REAL, modified TEXT, PRIMARY KEY (item_code, warehouse)
    );
    CREATE TABLE IF NOT EXISTS pos_item_barcodes (
      parent TEXT NOT NULL, barcode TEXT NOT NULL, uom TEXT, modified TEXT,
      PRIMARY KEY (parent, barcode)
    );
    CREATE TABLE IF NOT EXISTS pos_item_uom_conversions (
      parent TEXT NOT NULL, uom TEXT NOT NULL, conversion_factor REAL NOT NULL,
      modified TEXT, PRIMARY KEY (parent, uom)
    );
    CREATE TABLE IF NOT EXISTS pos_fbr_item_config (
      item_code TEXT PRIMARY KEY, custom_fbr_tax_category TEXT, custom_fbr_hs_code TEXT,
      custom_mrp REAL, custom_is_3rd_schedule INTEGER, tax_rate REAL, is_third_schedule INTEGER,
      is_exempt INTEGER, is_zero_rated INTEGER, fbr_sale_type TEXT, enabled INTEGER NOT NULL, modified TEXT
    );
    CREATE TABLE IF NOT EXISTS fbr_sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_sync_state (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pos_cart_state (
      cart_key TEXT PRIMARY KEY, terminal_id TEXT NOT NULL, opening_entry TEXT NOT NULL,
      json_data TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pos_payment_draft (cart_key TEXT PRIMARY KEY, json_data TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pos_sales_history (
      terminal_invoice_id TEXT PRIMARY KEY, pos_invoice TEXT, status TEXT NOT NULL,
      payload_json TEXT NOT NULL, response_json TEXT, created_at TEXT NOT NULL, submitted_at TEXT,
      reprint_count INTEGER NOT NULL DEFAULT 0, last_reprinted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pos_receipt_cache (
      pos_invoice TEXT PRIMARY KEY,
      html TEXT NOT NULL,
      cached_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pos_benefits_draft (cart_key TEXT PRIMARY KEY, json_data TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pos_customers (
      name TEXT PRIMARY KEY, customer_name TEXT, customer_group TEXT, territory TEXT,
      mobile_no TEXT, email_id TEXT, tax_id TEXT, disabled INTEGER NOT NULL, modified TEXT
    );
    CREATE TABLE IF NOT EXISTS customer_sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pos_customer_cache (name TEXT PRIMARY KEY, json_data TEXT NOT NULL, synced_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS held_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      terminal_invoice_id TEXT NOT NULL,
      display_name TEXT,
      customer TEXT, customer_name TEXT,
      pos_profile TEXT, company TEXT, branch TEXT, opening_entry TEXT,
      cart_json TEXT NOT NULL, payment_json TEXT, benefits_json TEXT, totals_json TEXT,
      validation_snapshot_json TEXT,
      item_count INTEGER NOT NULL DEFAULT 0, estimated_total REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Held'
    );
    CREATE TABLE IF NOT EXISTS pos_shift_history (
      opening_entry TEXT PRIMARY KEY,
      closing_entry TEXT,
      pos_profile TEXT,
      cashier TEXT,
      company TEXT,
      opened_at TEXT,
      closed_at TEXT,
      opening_cash REAL NOT NULL DEFAULT 0,
      expected_cash REAL NOT NULL DEFAULT 0,
      actual_cash REAL NOT NULL DEFAULT 0,
      difference REAL NOT NULL DEFAULT 0,
      net_sales REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Closed',
      summary_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_held_sales_status ON held_sales(status);
    CREATE INDEX IF NOT EXISTS idx_sales_history_created ON pos_sales_history(created_at);
    CREATE INDEX IF NOT EXISTS idx_shift_history_closed ON pos_shift_history(closed_at);
    CREATE TABLE IF NOT EXISTS pos_refund_log (
      return_invoice TEXT PRIMARY KEY, opening_entry TEXT, amount REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_refund_log_opening ON pos_refund_log(opening_entry);
  `);

  const insertMeta = database.prepare(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING"
  );

  // Baseline (version 1): set only on a brand-new DB; existing DBs keep their recorded version.
  insertMeta.run("schema_version", "1");
  insertMeta.run("created_at", new Date().toISOString());

  // Advance the schema to the latest version via the ordered migration runner.
  runMigrations();
}

export function upsertFbrItemConfig(rows: Record<string, unknown>[], serviceFee: number): void { if(!database)throw new Error("Database is not initialized.");const text=(r:Record<string,unknown>,k:string)=>typeof r[k]==="string"?r[k]:"";const num=(r:Record<string,unknown>,k:string)=>typeof r[k]==="number"?r[k]:null;const bool=(r:Record<string,unknown>,k:string)=>r[k]?1:0;const stmt=database.prepare(`INSERT INTO pos_fbr_item_config VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(item_code) DO UPDATE SET custom_fbr_tax_category=excluded.custom_fbr_tax_category,custom_fbr_hs_code=excluded.custom_fbr_hs_code,custom_mrp=excluded.custom_mrp,custom_is_3rd_schedule=excluded.custom_is_3rd_schedule,tax_rate=excluded.tax_rate,is_third_schedule=excluded.is_third_schedule,is_exempt=excluded.is_exempt,is_zero_rated=excluded.is_zero_rated,fbr_sale_type=excluded.fbr_sale_type,enabled=excluded.enabled,modified=excluded.modified`);database.transaction(()=>{for(const r of rows)stmt.run(text(r,"item_code"),text(r,"custom_fbr_tax_category"),text(r,"custom_fbr_hs_code"),num(r,"custom_mrp"),bool(r,"custom_is_3rd_schedule"),num(r,"tax_rate"),bool(r,"is_third_schedule"),bool(r,"is_exempt"),bool(r,"is_zero_rated"),text(r,"fbr_sale_type"),r.enabled===false?0:1,text(r,"modified"));const state=database!.prepare("INSERT INTO fbr_sync_state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");state.run("item_count",String((database!.prepare("SELECT COUNT(*) n FROM pos_fbr_item_config").get() as {n:number}).n));state.run("service_fee",String(serviceFee));state.run("last_synced",new Date().toISOString());})(); }
export function getFbrSyncState():{itemCount:number;serviceFee:number;lastSynced:string|null;ready:boolean}{if(!database)return{itemCount:0,serviceFee:0,lastSynced:null,ready:false};const v=(k:string)=>(database!.prepare("SELECT value FROM fbr_sync_state WHERE key=?").get(k) as {value:string}|undefined)?.value??"";return{itemCount:Number(v("item_count"))||0,serviceFee:Number(v("service_fee"))||0,lastSynced:v("last_synced")||null,ready:true};}
export function getFbrItemConfigs(itemCodes:string[]):Record<string,Record<string,unknown>>{if(!database||!itemCodes.length)return{};const marks=itemCodes.map(()=>"?").join(",");const rows=database.prepare(`SELECT * FROM pos_fbr_item_config WHERE item_code IN (${marks})`).all(...itemCodes) as Record<string,unknown>[];return Object.fromEntries(rows.map(row=>[String(row.item_code),row]));}

// ----- Held sales (Phase 3) -----
export interface HeldSaleInput {
  terminalInvoiceId: string; displayName: string; customer: string; customerName: string;
  posProfile: string; company: string; branch: string; openingEntry: string;
  cart: unknown[]; payments: unknown[]; benefits: Record<string, unknown>; totals: Record<string, unknown>;
  validationSnapshot: Record<string, unknown>; itemCount: number; estimatedTotal: number;
}
export interface HeldSaleSummary {
  id: number; terminalInvoiceId: string; displayName: string; customer: string; customerName: string;
  posProfile: string; openingEntry: string; itemCount: number; estimatedTotal: number; createdAt: string; updatedAt: string; status: string;
}
export interface HeldSaleDetail extends HeldSaleSummary {
  company: string; branch: string; cart: unknown[]; payments: unknown[]; benefits: Record<string, unknown> | null; totals: Record<string, unknown> | null; validationSnapshot: Record<string, unknown> | null;
}
function parseObject(value: string | null): Record<string, unknown> | null { try { const data = value ? JSON.parse(value) : null; return typeof data === "object" && data && !Array.isArray(data) ? data as Record<string, unknown> : null; } catch { return null; } }
function parseArray(value: string | null): unknown[] { try { const data = value ? JSON.parse(value) : []; return Array.isArray(data) ? data : []; } catch { return []; } }

export function holdSale(input: HeldSaleInput): { id: number; displayName: string } {
  if (!database) throw new Error("Database is not initialized.");
  const now = new Date().toISOString();
  const result = database.prepare(`INSERT INTO held_sales
    (terminal_invoice_id, display_name, customer, customer_name, pos_profile, company, branch, opening_entry,
     cart_json, payment_json, benefits_json, totals_json, validation_snapshot_json, item_count, estimated_total, created_at, updated_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Held')`).run(
    input.terminalInvoiceId, input.displayName, input.customer, input.customerName, input.posProfile, input.company, input.branch, input.openingEntry,
    JSON.stringify(input.cart), JSON.stringify(input.payments), JSON.stringify(input.benefits), JSON.stringify(input.totals), JSON.stringify(input.validationSnapshot),
    input.itemCount, input.estimatedTotal, now, now);
  return { id: Number(result.lastInsertRowid), displayName: input.displayName };
}
export function listHeldSales(): HeldSaleSummary[] {
  if (!database) return [];
  const rows = database.prepare("SELECT * FROM held_sales WHERE status='Held' ORDER BY created_at DESC").all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id), terminalInvoiceId: String(r.terminal_invoice_id ?? ""), displayName: String(r.display_name ?? ""),
    customer: String(r.customer ?? ""), customerName: String(r.customer_name ?? ""), posProfile: String(r.pos_profile ?? ""),
    openingEntry: String(r.opening_entry ?? ""), itemCount: Number(r.item_count ?? 0), estimatedTotal: Number(r.estimated_total ?? 0),
    createdAt: String(r.created_at ?? ""), updatedAt: String(r.updated_at ?? ""), status: String(r.status ?? "Held")
  }));
}
export function getHeldSale(id: number): HeldSaleDetail | null {
  if (!database) return null;
  const r = database.prepare("SELECT * FROM held_sales WHERE id=?").get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: Number(r.id), terminalInvoiceId: String(r.terminal_invoice_id ?? ""), displayName: String(r.display_name ?? ""),
    customer: String(r.customer ?? ""), customerName: String(r.customer_name ?? ""), posProfile: String(r.pos_profile ?? ""),
    company: String(r.company ?? ""), branch: String(r.branch ?? ""), openingEntry: String(r.opening_entry ?? ""),
    itemCount: Number(r.item_count ?? 0), estimatedTotal: Number(r.estimated_total ?? 0), createdAt: String(r.created_at ?? ""), updatedAt: String(r.updated_at ?? ""), status: String(r.status ?? "Held"),
    cart: parseArray(r.cart_json as string ?? null), payments: parseArray(r.payment_json as string ?? null),
    benefits: parseObject(r.benefits_json as string ?? null), totals: parseObject(r.totals_json as string ?? null), validationSnapshot: parseObject(r.validation_snapshot_json as string ?? null)
  };
}
export function deleteHeldSale(id: number): void { if (!database) return; database.prepare("DELETE FROM held_sales WHERE id=?").run(id); }
export function deleteAllHeldSales(): number {
  if (!database) return 0;
  const result = database.prepare("DELETE FROM held_sales WHERE status='Held'").run();
  return Number(result.changes ?? 0);
}
export function renameHeldSale(id: number, name: string): void { if (!database) return; database.prepare("UPDATE held_sales SET display_name=?, updated_at=? WHERE id=?").run(name, new Date().toISOString(), id); }

// ----- Sales history queries + reprint tracking (Phase 4) -----
export interface SalesHistoryFilter { search?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number; }
export interface SalesHistoryRow {
  terminalInvoiceId: string; posInvoice: string | null; status: string; createdAt: string; submittedAt: string | null;
  reprintCount: number; lastReprintedAt: string | null; payload: Record<string, unknown> | null; response: Record<string, unknown> | null;
}
function mapSalesHistory(r: Record<string, unknown>): SalesHistoryRow {
  return {
    terminalInvoiceId: String(r.terminal_invoice_id ?? ""), posInvoice: r.pos_invoice ? String(r.pos_invoice) : null, status: String(r.status ?? ""),
    createdAt: String(r.created_at ?? ""), submittedAt: r.submitted_at ? String(r.submitted_at) : null,
    reprintCount: Number(r.reprint_count ?? 0), lastReprintedAt: r.last_reprinted_at ? String(r.last_reprinted_at) : null,
    payload: parseObject(r.payload_json as string ?? null), response: parseObject(r.response_json as string ?? null)
  };
}
export function listSalesHistory(filter: SalesHistoryFilter): SalesHistoryRow[] {
  if (!database) return [];
  const limit = Math.min(Math.max(Number(filter.limit) || 50, 1), 200);
  const offset = Math.max(Number(filter.offset) || 0, 0);
  const clauses: string[] = ["status IN ('Submitted','Failed','Queued')"];
  const params: unknown[] = [];
  if (filter.search && filter.search.trim()) {
    const q = `%${filter.search.trim()}%`;
    clauses.push("(pos_invoice LIKE ? OR terminal_invoice_id LIKE ? OR payload_json LIKE ? OR response_json LIKE ?)");
    params.push(q, q, q, q);
  }
  if (filter.dateFrom) { clauses.push("created_at >= ?"); params.push(filter.dateFrom); }
  if (filter.dateTo) { clauses.push("created_at <= ?"); params.push(filter.dateTo); }
  const sql = `SELECT * FROM pos_sales_history WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  const rows = database.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapSalesHistory);
}
// Used when holding (mark the open terminal-invoice row 'Held' so a fresh UUID is issued) and on resume (back to 'Open').
export function setSaleHistoryStatus(terminalInvoiceId: string, status: string): void {
  if (!database) return;
  database.prepare("UPDATE pos_sales_history SET status=? WHERE terminal_invoice_id=?").run(status, terminalInvoiceId);
}
export function getSaleHistory(terminalInvoiceId: string): SalesHistoryRow | null {
  if (!database) return null;
  const r = database.prepare("SELECT * FROM pos_sales_history WHERE terminal_invoice_id=?").get(terminalInvoiceId) as Record<string, unknown> | undefined;
  return r ? mapSalesHistory(r) : null;
}
export function recordReprint(terminalInvoiceId: string): { reprintCount: number; lastReprintedAt: string } {
  if (!database) throw new Error("Database is not initialized.");
  const now = new Date().toISOString();
  database.prepare("UPDATE pos_sales_history SET reprint_count = COALESCE(reprint_count,0) + 1, last_reprinted_at = ? WHERE terminal_invoice_id = ?").run(now, terminalInvoiceId);
  const row = database.prepare("SELECT reprint_count FROM pos_sales_history WHERE terminal_invoice_id=?").get(terminalInvoiceId) as { reprint_count: number } | undefined;
  return { reprintCount: Number(row?.reprint_count ?? 0), lastReprintedAt: now };
}

export function saveSaleHistory(id:string,status:string,payload:Record<string,unknown>,response:Record<string,unknown>|null=null):void{if(!database)throw new Error("Database is not initialized.");const now=new Date().toISOString();database.prepare("INSERT INTO pos_sales_history (terminal_invoice_id, pos_invoice, status, payload_json, response_json, created_at, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(terminal_invoice_id) DO UPDATE SET pos_invoice=excluded.pos_invoice,status=excluded.status,payload_json=excluded.payload_json,response_json=excluded.response_json,submitted_at=excluded.submitted_at").run(id,typeof response?.pos_invoice==="string"?response.pos_invoice:null,status,JSON.stringify(payload),response?JSON.stringify(response):null,now,status==="Submitted"?now:null);}

export function cacheReceiptHtml(posInvoice: string, html: string): void {
  if (!database || !posInvoice.trim() || !html.trim()) return;
  database.prepare("INSERT INTO pos_receipt_cache (pos_invoice, html, cached_at) VALUES (?, ?, ?) ON CONFLICT(pos_invoice) DO UPDATE SET html=excluded.html,cached_at=excluded.cached_at")
    .run(posInvoice, html, new Date().toISOString());
}

export function getCachedReceiptHtml(posInvoice: string): string | null {
  if (!database || !posInvoice.trim()) return null;
  const row = database.prepare("SELECT html FROM pos_receipt_cache WHERE pos_invoice=?").get(posInvoice) as { html: string } | undefined;
  return row?.html || null;
}

// ----- Offline sale queue -----
export interface QueuedSale { terminalInvoiceId: string; payload: Record<string, unknown>; response: Record<string, unknown> | null; createdAt: string; }
// Oldest first so the queue replays in the order the sales were taken.
export function getQueuedSales(): QueuedSale[] {
  if (!database) return [];
  const rows = database.prepare("SELECT * FROM pos_sales_history WHERE status='Queued' ORDER BY created_at ASC").all() as Record<string, unknown>[];
  return rows.map((r) => ({ terminalInvoiceId: String(r.terminal_invoice_id ?? ""), payload: parseObject(r.payload_json as string ?? null) ?? {}, response: parseObject(r.response_json as string ?? null), createdAt: String(r.created_at ?? "") }));
}
// ----- Refund log (for shift summary refund totals; refunds aren't in pos_sales_history) -----
export function logRefund(returnInvoice: string, openingEntry: string, amount: number, modeOfPayment = ""): void {
  if (!database) return;
  database.prepare("INSERT INTO pos_refund_log (return_invoice, opening_entry, amount, mode_of_payment, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(return_invoice) DO UPDATE SET amount=excluded.amount, opening_entry=excluded.opening_entry, mode_of_payment=excluded.mode_of_payment")
    .run(returnInvoice || `refund-${Date.now()}`, openingEntry, Math.abs(amount) || 0, modeOfPayment, new Date().toISOString());
}
export function getShiftRefundTotal(openingEntry: string): number {
  if (!database || !openingEntry) return 0;
  const row = database.prepare("SELECT COALESCE(SUM(amount),0) total FROM pos_refund_log WHERE opening_entry=?").get(openingEntry) as { total: number } | undefined;
  return Number(row?.total) || 0;
}
export function getShiftRefundBreakdown(openingEntry: string): Record<string, number> {
  if (!database || !openingEntry) return {};
  const rows = database.prepare("SELECT COALESCE(mode_of_payment,'') mode, COALESCE(SUM(amount),0) total FROM pos_refund_log WHERE opening_entry=? GROUP BY COALESCE(mode_of_payment,'')").all(openingEntry) as { mode: string; total: number }[];
  return Object.fromEntries(rows.map((row) => [String(row.mode || ""), Number(row.total) || 0]));
}

export function getQueueCounts(): { queued: number; failed: number } {
  if (!database) return { queued: 0, failed: 0 };
  const queued = (database.prepare("SELECT COUNT(*) n FROM pos_sales_history WHERE status='Queued'").get() as { n: number }).n;
  const failed = (database.prepare("SELECT COUNT(*) n FROM pos_sales_history WHERE status='Failed'").get() as { n: number }).n;
  return { queued: Number(queued) || 0, failed: Number(failed) || 0 };
}

export function getOpenTerminalInvoice(hardwareId:string,createId:()=>string):string{if(!database)throw new Error("Database is not initialized.");const row=database.prepare("SELECT terminal_invoice_id FROM pos_sales_history WHERE status='Open' AND json_extract(payload_json, '$.hardware_id')=? ORDER BY created_at DESC LIMIT 1").get(hardwareId) as {terminal_invoice_id:string}|undefined;if(row)return row.terminal_invoice_id;const id=createId();saveSaleHistory(id,"Open",{hardware_id:hardwareId});return id;}

// ----- Shift history (Close Shift) -----
export interface ShiftHistoryRow {
  openingEntry: string; closingEntry: string | null; posProfile: string; cashier: string; company: string;
  openedAt: string | null; closedAt: string | null; openingCash: number; expectedCash: number; actualCash: number;
  difference: number; netSales: number; status: string; summary: Record<string, unknown> | null; createdAt: string;
}
export interface ShiftHistoryInput {
  openingEntry: string; closingEntry: string | null; posProfile: string; cashier: string; company: string;
  openedAt: string | null; closedAt: string | null; openingCash: number; expectedCash: number; actualCash: number;
  difference: number; netSales: number; status: string; summary: Record<string, unknown>;
}
function mapShiftHistory(r: Record<string, unknown>): ShiftHistoryRow {
  return {
    openingEntry: String(r.opening_entry ?? ""), closingEntry: r.closing_entry ? String(r.closing_entry) : null,
    posProfile: String(r.pos_profile ?? ""), cashier: String(r.cashier ?? ""), company: String(r.company ?? ""),
    openedAt: r.opened_at ? String(r.opened_at) : null, closedAt: r.closed_at ? String(r.closed_at) : null,
    openingCash: Number(r.opening_cash ?? 0), expectedCash: Number(r.expected_cash ?? 0), actualCash: Number(r.actual_cash ?? 0),
    difference: Number(r.difference ?? 0), netSales: Number(r.net_sales ?? 0), status: String(r.status ?? "Closed"),
    summary: parseObject(r.summary_json as string ?? null), createdAt: String(r.created_at ?? "")
  };
}
export function saveShiftHistory(input: ShiftHistoryInput): void {
  if (!database) throw new Error("Database is not initialized.");
  database.prepare(`INSERT INTO pos_shift_history
    (opening_entry, closing_entry, pos_profile, cashier, company, opened_at, closed_at, opening_cash, expected_cash, actual_cash, difference, net_sales, status, summary_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(opening_entry) DO UPDATE SET closing_entry=excluded.closing_entry,pos_profile=excluded.pos_profile,cashier=excluded.cashier,company=excluded.company,opened_at=excluded.opened_at,closed_at=excluded.closed_at,opening_cash=excluded.opening_cash,expected_cash=excluded.expected_cash,actual_cash=excluded.actual_cash,difference=excluded.difference,net_sales=excluded.net_sales,status=excluded.status,summary_json=excluded.summary_json`).run(
    input.openingEntry, input.closingEntry, input.posProfile, input.cashier, input.company, input.openedAt, input.closedAt,
    input.openingCash, input.expectedCash, input.actualCash, input.difference, input.netSales, input.status,
    JSON.stringify(input.summary), new Date().toISOString());
}
export function listShiftHistory(limit = 100): ShiftHistoryRow[] {
  if (!database) return [];
  const rows = database.prepare("SELECT * FROM pos_shift_history ORDER BY COALESCE(closed_at, created_at) DESC LIMIT ?").all(Math.min(Math.max(limit, 1), 500)) as Record<string, unknown>[];
  return rows.map(mapShiftHistory);
}
export function getShiftHistory(openingEntry: string): ShiftHistoryRow | null {
  if (!database || !openingEntry) return null;
  const r = database.prepare("SELECT * FROM pos_shift_history WHERE opening_entry=?").get(openingEntry) as Record<string, unknown> | undefined;
  return r ? mapShiftHistory(r) : null;
}

export function loadBenefitsDraft(cartKey: string): Record<string, unknown> | null {
  if (!database || !cartKey) return null;
  const row = database.prepare("SELECT json_data FROM pos_benefits_draft WHERE cart_key=?").get(cartKey) as { json_data: string } | undefined;
  try { const data = row ? JSON.parse(row.json_data) : null; return typeof data === "object" && data && !Array.isArray(data) ? data as Record<string, unknown> : null; } catch { return null; }
}

export function saveBenefitsDraft(cartKey: string, benefits: Record<string, unknown>): void {
  if (!database) throw new Error("Database is not initialized.");
  database.prepare("INSERT INTO pos_benefits_draft VALUES (?, ?, ?) ON CONFLICT(cart_key) DO UPDATE SET json_data=excluded.json_data,updated_at=excluded.updated_at").run(cartKey, JSON.stringify(benefits), new Date().toISOString());
}

export function loadPaymentDraft(cartKey: string): unknown[] { if(!database||!cartKey)return []; const row=database.prepare("SELECT json_data FROM pos_payment_draft WHERE cart_key=?").get(cartKey) as {json_data:string}|undefined; try{const data=row?JSON.parse(row.json_data):[];return Array.isArray(data)?data:[];}catch{return [];} }
export function savePaymentDraft(cartKey: string, payments: unknown[]): void { if(!database)throw new Error("Database is not initialized."); database.prepare("INSERT INTO pos_payment_draft VALUES (?, ?, ?) ON CONFLICT(cart_key) DO UPDATE SET json_data=excluded.json_data,updated_at=excluded.updated_at").run(cartKey,JSON.stringify(payments),new Date().toISOString()); }

export function upsertCustomers(customers: Record<string, unknown>[]): void {
  if (!database) throw new Error("Database is not initialized.");
  const text = (row: Record<string, unknown>, key: string): string => typeof row[key] === "string" ? row[key] : "";
  const statement = database.prepare(`INSERT INTO pos_customers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET customer_name=excluded.customer_name,customer_group=excluded.customer_group,territory=excluded.territory,mobile_no=excluded.mobile_no,email_id=excluded.email_id,tax_id=excluded.tax_id,disabled=excluded.disabled,modified=excluded.modified`);
  database.transaction(() => { for (const row of customers) statement.run(text(row,"name"),text(row,"customer_name"),text(row,"customer_group"),text(row,"territory"),text(row,"mobile_no"),text(row,"email_id"),text(row,"tax_id"),row.disabled ? 1 : 0,text(row,"modified")); })();
  // Live COUNT(*) so a delta sync reports the true cached total, not just the changed-row count.
  const customerCount = (database.prepare("SELECT COUNT(*) n FROM pos_customers").get() as { n: number }).n;
  database.prepare("INSERT INTO customer_sync_state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run("count", String(customerCount));
  database.prepare("INSERT INTO customer_sync_state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run("last_synced", new Date().toISOString());
}

export function getCustomerSyncState(): { count: number; lastSynced: string | null } { if (!database) return {count:0,lastSynced:null}; const value=(key:string)=>(database!.prepare("SELECT value FROM customer_sync_state WHERE key=?").get(key) as {value:string}|undefined)?.value??""; return { count:Number(value("count"))||0,lastSynced:value("last_synced")||null }; }
export function searchCustomers(query: string): Record<string, unknown>[] { if (!database || !query.trim()) return []; const q=`%${query}%`; return database.prepare("SELECT * FROM pos_customers WHERE disabled=0 AND (name LIKE ? OR customer_name LIKE ? OR mobile_no LIKE ? OR email_id LIKE ? OR tax_id LIKE ?) ORDER BY customer_name LIMIT 8").all(q,q,q,q,q) as Record<string,unknown>[]; }
export function findCustomerByNormalizedMobile(normalizedMobile: string): Record<string, unknown> | null { if(!database||!normalizedMobile)return null; const normalize=(value:string)=>{const digits=value.replace(/\D/g,"");if(digits.startsWith("92"))return `+${digits}`;if(digits.startsWith("0"))return `+92${digits.slice(1)}`;if(digits.length===10&&digits.startsWith("3"))return `+92${digits}`;return value.startsWith("+")?`+${digits}`:"";}; const rows=database.prepare("SELECT * FROM pos_customers WHERE mobile_no IS NOT NULL AND mobile_no <> ''").all() as Record<string,unknown>[]; return rows.find((row)=>normalize(String(row.mobile_no??""))===normalizedMobile)??null; }
export function cacheCustomer(name: string, data: Record<string, unknown>): void { if (!database) throw new Error("Database is not initialized."); database.prepare("INSERT INTO pos_customer_cache VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET json_data=excluded.json_data,synced_at=excluded.synced_at").run(name,JSON.stringify(data),new Date().toISOString()); }
export function getCachedCustomer(name: string): Record<string, unknown> | null { if (!database||!name)return null; const row=database.prepare("SELECT json_data FROM pos_customer_cache WHERE name=?").get(name) as {json_data:string}|undefined; try { const data=row?JSON.parse(row.json_data):null; return typeof data==="object"&&data&&!Array.isArray(data)?data as Record<string,unknown>:null; } catch{return null;} }

export function loadCartState(hardwareId: string, openingEntry: string): CartState {
  if (!database) return { cartKey: "", lines: [] };
  const cartKey = `${hardwareId}::${openingEntry}`;
  const row = database.prepare("SELECT json_data FROM pos_cart_state WHERE cart_key=?").get(cartKey) as { json_data: string } | undefined;
  if (!row) return { cartKey, lines: [] };
  try { const lines = JSON.parse(row.json_data); return { cartKey, lines: Array.isArray(lines) ? lines : [] }; } catch { return { cartKey, lines: [] }; }
}

export function saveCartState(hardwareId: string, openingEntry: string, lines: unknown[]): void {
  if (!database) throw new Error("Database is not initialized.");
  const cartKey = `${hardwareId}::${openingEntry}`;
  database.prepare(`INSERT INTO pos_cart_state VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(cart_key) DO UPDATE SET json_data=excluded.json_data,updated_at=excluded.updated_at`)
    .run(cartKey, hardwareId, openingEntry, JSON.stringify(lines), new Date().toISOString());
}

export function upsertCatalog(data: {
  items: Record<string, unknown>[];
  prices: Record<string, unknown>[];
  stock: Record<string, unknown>[];
  barcodes: Record<string, unknown>[];
  conversions: Record<string, unknown>[];
  totals: CatalogTotals;
  replaceBarcodes: boolean;
  replaceConversions: boolean;
}): void {
  if (!database) throw new Error("Database is not initialized.");
  const text = (row: Record<string, unknown>, key: string): string => typeof row[key] === "string" ? row[key] : "";
  const number = (row: Record<string, unknown>, key: string): number | null => typeof row[key] === "number" ? row[key] : null;
  const bool = (row: Record<string, unknown>, key: string): number => row[key] ? 1 : 0;
  const item = database.prepare(`INSERT INTO pos_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_code) DO UPDATE SET item_name=excluded.item_name,item_group=excluded.item_group,stock_uom=excluded.stock_uom,is_stock_item=excluded.is_stock_item,is_sales_item=excluded.is_sales_item,disabled=excluded.disabled,has_batch_no=excluded.has_batch_no,has_serial_no=excluded.has_serial_no,modified=excluded.modified`);
  const price = database.prepare(`INSERT INTO pos_item_prices VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET item_code=excluded.item_code,uom=excluded.uom,price_list_rate=excluded.price_list_rate,currency=excluded.currency,valid_from=excluded.valid_from,valid_upto=excluded.valid_upto,modified=excluded.modified`);
  const stock = database.prepare(`INSERT INTO pos_item_stock VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_code,warehouse) DO UPDATE SET actual_qty=excluded.actual_qty,reserved_qty=excluded.reserved_qty,projected_qty=excluded.projected_qty,modified=excluded.modified`);
  const barcode = database.prepare(`INSERT INTO pos_item_barcodes VALUES (?, ?, ?, ?)
    ON CONFLICT(parent,barcode) DO UPDATE SET uom=excluded.uom,modified=excluded.modified`);
  const conversion = database.prepare(`INSERT INTO pos_item_uom_conversions VALUES (?, ?, ?, ?)
    ON CONFLICT(parent,uom) DO UPDATE SET conversion_factor=excluded.conversion_factor,modified=excluded.modified`);
  const state = database.prepare("INSERT INTO catalog_sync_state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  database.transaction(() => {
    for (const row of data.items) item.run(text(row, "name"), text(row, "item_name"), text(row, "item_group"), text(row, "stock_uom"), bool(row, "is_stock_item"), bool(row, "is_sales_item"), bool(row, "disabled"), bool(row, "has_batch_no"), bool(row, "has_serial_no"), text(row, "modified"));
    for (const row of data.prices) price.run(text(row, "name"), text(row, "item_code"), text(row, "uom"), number(row, "price_list_rate"), text(row, "currency"), text(row, "valid_from"), text(row, "valid_upto"), text(row, "modified"));
    for (const row of data.stock) stock.run(text(row, "item_code"), text(row, "warehouse"), number(row, "actual_qty"), number(row, "reserved_qty"), number(row, "projected_qty"), text(row, "modified"));
    if (data.replaceBarcodes) database!.prepare("DELETE FROM pos_item_barcodes").run();
    for (const row of data.barcodes) barcode.run(text(row, "item_code") || text(row, "parent"), text(row, "barcode"), text(row, "uom"), text(row, "modified"));
    if (data.replaceConversions) database!.prepare("DELETE FROM pos_item_uom_conversions").run();
    for (const row of data.conversions) conversion.run(text(row, "item_code") || text(row, "parent"), text(row, "uom"), number(row, "conversion_factor") ?? 1, text(row, "modified"));
    // Counts from live COUNT(*) (not fetched-row length) so a delta sync reports true totals, not the delta size.
    const count = (table: string): string => String((database!.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n);
    state.run("items", count("pos_items")); state.run("prices", count("pos_item_prices")); state.run("barcodes", count("pos_item_barcodes")); state.run("stock_rows", count("pos_item_stock")); state.run("last_synced", data.totals.lastSynced ?? "");
  })();
}

export function getCatalogTotals(): CatalogTotals {
  if (!database) return { items: 0, prices: 0, barcodes: 0, stockRows: 0, lastSynced: null };
  const value = (key: string): string => (database?.prepare("SELECT value FROM catalog_sync_state WHERE key=?").get(key) as { value: string } | undefined)?.value ?? "";
  return { items: Number(value("items")) || 0, prices: Number(value("prices")) || 0, barcodes: Number(value("barcodes")) || 0, stockRows: Number(value("stock_rows")) || 0, lastSynced: value("last_synced") || null };
}

export function searchCatalog(query: string, warehouse: string): CatalogSearchResult[] {
  if (!database || !query.trim()) return [];
  return database.prepare(`SELECT i.item_code itemCode, i.item_name itemName,
    b.barcode barcode,
    COALESCE(b.uom,i.stock_uom) uom,
    COALESCE(c.conversion_factor, CASE WHEN COALESCE(b.uom,i.stock_uom)=i.stock_uom THEN 1 END, 1) conversionFactor,
    COALESCE(
      (SELECT p.price_list_rate FROM pos_item_prices p WHERE p.item_code=i.item_code AND COALESCE(p.uom,'')=COALESCE(b.uom,i.stock_uom,'') ORDER BY p.modified DESC LIMIT 1),
      (SELECT p.price_list_rate * COALESCE(c.conversion_factor, CASE WHEN COALESCE(b.uom,i.stock_uom)=i.stock_uom THEN 1 END, 1) FROM pos_item_prices p WHERE p.item_code=i.item_code AND COALESCE(p.uom,'')=COALESCE(i.stock_uom,'') ORDER BY p.modified DESC LIMIT 1)
    ) sellingPrice,
    COALESCE(
      (SELECT p.currency FROM pos_item_prices p WHERE p.item_code=i.item_code AND COALESCE(p.uom,'')=COALESCE(b.uom,i.stock_uom,'') ORDER BY p.modified DESC LIMIT 1),
      (SELECT p.currency FROM pos_item_prices p WHERE p.item_code=i.item_code AND COALESCE(p.uom,'')=COALESCE(i.stock_uom,'') ORDER BY p.modified DESC LIMIT 1)
    ) currency,
    s.actual_qty actualStock, s.warehouse warehouse, f.custom_mrp mrp
    FROM pos_items i
    LEFT JOIN pos_item_barcodes b ON b.parent=i.item_code AND b.barcode=?
    LEFT JOIN pos_item_uom_conversions c ON c.parent=i.item_code AND c.uom=COALESCE(b.uom,i.stock_uom)
    LEFT JOIN pos_item_stock s ON s.item_code=i.item_code AND s.warehouse=?
    LEFT JOIN pos_fbr_item_config f ON f.item_code=i.item_code
    WHERE i.is_sales_item=1 AND i.disabled=0 AND (i.item_code LIKE ? OR i.item_name LIKE ? OR b.barcode IS NOT NULL)
    ORDER BY CASE WHEN i.item_code=? THEN 0 ELSE 1 END, i.item_name LIMIT 50`).all(query, warehouse, `%${query}%`, `%${query}%`, query) as CatalogSearchResult[];
}

export function lookupCatalog(query: string, warehouse: string): { exact: CatalogSearchResult | null; results: CatalogSearchResult[] } {
  if (!database || !query.trim()) return { exact: null, results: [] };
  const base = `SELECT i.item_code itemCode,i.item_name itemName,b.barcode barcode,COALESCE(b.uom,i.stock_uom) uom,
    COALESCE(c.conversion_factor, CASE WHEN COALESCE(b.uom,i.stock_uom)=i.stock_uom THEN 1 END, 1) conversionFactor,
    COALESCE(
      (SELECT p.price_list_rate FROM pos_item_prices p WHERE p.item_code=i.item_code AND COALESCE(p.uom,'')=COALESCE(b.uom,i.stock_uom,'') ORDER BY p.modified DESC LIMIT 1),
      (SELECT p.price_list_rate * COALESCE(c.conversion_factor, CASE WHEN COALESCE(b.uom,i.stock_uom)=i.stock_uom THEN 1 END, 1) FROM pos_item_prices p WHERE p.item_code=i.item_code AND COALESCE(p.uom,'')=COALESCE(i.stock_uom,'') ORDER BY p.modified DESC LIMIT 1)
    ) sellingPrice,
    COALESCE(
      (SELECT p.currency FROM pos_item_prices p WHERE p.item_code=i.item_code AND COALESCE(p.uom,'')=COALESCE(b.uom,i.stock_uom,'') ORDER BY p.modified DESC LIMIT 1),
      (SELECT p.currency FROM pos_item_prices p WHERE p.item_code=i.item_code AND COALESCE(p.uom,'')=COALESCE(i.stock_uom,'') ORDER BY p.modified DESC LIMIT 1)
    ) currency,
    s.actual_qty actualStock,s.warehouse warehouse,f.custom_mrp mrp FROM pos_items i LEFT JOIN pos_item_stock s ON s.item_code=i.item_code AND s.warehouse=? LEFT JOIN pos_item_barcodes b ON b.parent=i.item_code AND b.barcode=? LEFT JOIN pos_item_uom_conversions c ON c.parent=i.item_code AND c.uom=COALESCE(b.uom,i.stock_uom) LEFT JOIN pos_fbr_item_config f ON f.item_code=i.item_code WHERE i.is_sales_item=1 AND i.disabled=0`;
  const barcode = database.prepare(`${base} AND b.barcode=? LIMIT 1`).get(warehouse, query, query) as CatalogSearchResult | undefined;
  if (barcode) return { exact: barcode, results: [] };
  const code = database.prepare(`${base} AND i.item_code=? LIMIT 1`).get(warehouse, query, query) as CatalogSearchResult | undefined;
  return code ? { exact: code, results: [] } : { exact: null, results: searchCatalog(query, warehouse) };
}

export function cachePosSession(openingEntry: string, posProfile: string, user: string, session: Record<string, unknown>, syncedAt: string): void {
  if (!database) {
    throw new Error("Database is not initialized.");
  }
  database.prepare(
    `INSERT INTO pos_session_cache (opening_entry, pos_profile, user, json_data, synced_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(opening_entry) DO UPDATE SET json_data = excluded.json_data, synced_at = excluded.synced_at`
  ).run(openingEntry, posProfile, user, JSON.stringify(session), syncedAt);
}

export function getCachedPosSession(posProfile: string): Record<string, unknown> | null {
  if (!database || !posProfile) {
    return null;
  }
  const row = database.prepare(
    "SELECT json_data FROM pos_session_cache WHERE pos_profile = ? ORDER BY synced_at DESC LIMIT 1"
  ).get(posProfile) as { json_data: string } | undefined;
  if (!row) {
    return null;
  }
  try {
    const data = JSON.parse(row.json_data);
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? data as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function cachePosBootstrap(posProfile: string, configuration: Record<string, unknown>, syncedAt: string): void {
  if (!database) {
    throw new Error("Database is not initialized.");
  }

  database.prepare(
    `INSERT INTO pos_bootstrap_cache (pos_profile, json_data, synced_at)
     VALUES (?, ?, ?)
     ON CONFLICT(pos_profile) DO UPDATE SET json_data = excluded.json_data, synced_at = excluded.synced_at`
  ).run(posProfile, JSON.stringify(configuration), syncedAt);
}

export function getPosBootstrap(posProfile: string): Record<string, unknown> | null {
  if (!database || !posProfile) {
    return null;
  }

  const row = database.prepare(
    "SELECT json_data FROM pos_bootstrap_cache WHERE pos_profile = ?"
  ).get(posProfile) as { json_data: string } | undefined;

  if (!row) {
    return null;
  }

  try {
    const data = JSON.parse(row.json_data);
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? data as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function cachePosProfile(name: string, profileData: Record<string, unknown>): string {
  if (!database) {
    throw new Error("Database is not initialized.");
  }

  const syncedAt = new Date().toISOString();
  database.prepare(
    `INSERT INTO pos_profile_cache (name, json_data, synced_at)
     VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET json_data = excluded.json_data, synced_at = excluded.synced_at`
  ).run(name, JSON.stringify(profileData), syncedAt);

  return syncedAt;
}

export function getPosProfileCacheStatus(): PosProfileCacheStatus {
  if (!database) {
    return { isReady: false, lastSynced: null };
  }

  const row = database.prepare(
    "SELECT synced_at FROM pos_profile_cache ORDER BY synced_at DESC LIMIT 1"
  ).get() as { synced_at: string } | undefined;

  return { isReady: true, lastSynced: row?.synced_at ?? null };
}

// Wipes every site-scoped cache table plus sync watermarks in app_meta. Called when
// erpnextUrl/apiKey changes (see main.ts's "settings:save" handler) since none of this
// data is keyed by site — e.g. pos_bootstrap_cache/pos_profile_cache key only on POS
// Profile name, so a new site reusing the same profile name would otherwise silently
// serve the old site's cached config. Cart/held-sale state is included because it
// references item codes/prices from the old site's catalog and is not yet a final
// transaction. Deliberately excludes app_settings (just-saved new settings) and
// pos_sales_history/pos_shift_history/pos_refund_log (submitted/closed financial
// records, never auto-deleted).
export function clearSiteScopedCache(): void {
  if (!database) {
    throw new Error("Database is not initialized.");
  }

  const clear = database.transaction(() => {
    for (const table of [
      "pos_items", "pos_item_prices", "pos_item_stock", "pos_item_barcodes", "pos_item_uom_conversions",
      "pos_fbr_item_config", "fbr_sync_state", "catalog_sync_state",
      "pos_customers", "pos_customer_cache", "customer_sync_state",
      "pos_profile_cache", "pos_bootstrap_cache", "pos_session_cache", "pos_receipt_cache",
      "pos_cart_state", "pos_payment_draft", "pos_benefits_draft", "held_sales"
    ]) {
      database!.prepare(`DELETE FROM ${table}`).run();
    }
    database!.prepare("DELETE FROM app_meta WHERE key LIKE '%_last_sync' OR key LIKE '%_last_full_sync'").run();
  });
  clear();
}

export function saveSettings(settings: AppSettings): { saved: true } {
  if (!database) {
    throw new Error("Database is not initialized.");
  }

  const saveSetting = database.prepare(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );

  const saveAll = database.transaction(() => {
    for (const key of settingKeys) {
      if (key === "apiSecret" && !settings.apiSecret) {
        continue;
      }
      // terminalId is now server-derived (from the assigned POS Profile), not user-typed — a blank
      // value here just means "not sourced yet from a settings-form/Quick-Connect round trip", so
      // never let it clobber a previously-synced value (mirrors the apiSecret skip-if-blank rule above).
      if (key === "terminalId" && !settings.terminalId) {
        continue;
      }
      saveSetting.run(key, key === "erpnextUrl" ? normalizeErpnextUrl(settings[key] ?? "") : settings[key] ?? (key === "colorTheme" ? "warm-market" : ""));
    }
  });

  saveAll();
  return { saved: true };
}

export function getSettingsForRenderer(): RendererSettings {
  const settings = loadSettings();
  return {
    erpnextUrl: settings.erpnextUrl,
    apiKey: settings.apiKey,
    terminalId: settings.terminalId,
    posProfile: settings.posProfile,
    branch: settings.branch,
    warehouse: settings.warehouse,
    hasApiSecret: Boolean(settings.apiSecret),
    receiptPrinter: settings.receiptPrinter,
    colorTheme: settings.colorTheme ?? "warm-market"
  };
}

export function loadSettings(): AppSettings {
  const settings: AppSettings = {
    colorTheme: "warm-market",
    erpnextUrl: "",
    apiKey: "",
    apiSecret: "",
    terminalId: "",
    posProfile: "",
    branch: "",
    warehouse: "",
    receiptPrinter: ""
  };

  if (!database) {
    return settings;
  }

  const getSetting = database.prepare("SELECT value FROM app_settings WHERE key = ?");

  for (const key of settingKeys) {
    const row = getSetting.get(key) as { value: string } | undefined;
    settings[key] = row?.value ?? "";
  }
  settings.erpnextUrl = normalizeErpnextUrl(settings.erpnextUrl);

  return settings;
}

// Releases the underlying file handle. Not called during normal app operation (the OS
// reclaims it on process exit) — exists for tests, which run multiple init/teardown
// cycles in one process and, on Windows, cannot delete a SQLite file while it's still open.
export function closeDatabase(): void {
  if (!database) return;
  database.close();
  database = null;
  databasePath = "";
}

export function getDatabaseStatus(): DatabaseStatus {
  if (!database) {
    return {
      isReady: false,
      path: databasePath,
      schemaVersion: null
    };
  }

  const schemaVersion = database
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get("schema_version") as { value: string } | undefined;

  return {
    isReady: true,
    path: databasePath,
    schemaVersion: schemaVersion?.value ?? null
  };
}
