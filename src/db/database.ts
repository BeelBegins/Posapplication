import { app } from "electron";
import Database from "better-sqlite3";
import path from "node:path";

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
}

export interface RendererSettings {
  erpnextUrl: string;
  apiKey: string;
  terminalId: string;
  posProfile: string;
  branch: string;
  warehouse: string;
  hasApiSecret: boolean;
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
  sellingPrice: number | null;
  currency: string | null;
  actualStock: number | null;
  warehouse: string | null;
}

export interface CartState { cartKey: string; lines: unknown[]; }

const settingKeys = ["erpnextUrl", "apiKey", "apiSecret", "terminalId", "posProfile", "branch", "warehouse"] as const;

let database: Database.Database | null = null;
let databasePath = "";

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
      payload_json TEXT NOT NULL, response_json TEXT, created_at TEXT NOT NULL, submitted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pos_benefits_draft (cart_key TEXT PRIMARY KEY, json_data TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pos_customers (
      name TEXT PRIMARY KEY, customer_name TEXT, customer_group TEXT, territory TEXT,
      mobile_no TEXT, email_id TEXT, tax_id TEXT, disabled INTEGER NOT NULL, modified TEXT
    );
    CREATE TABLE IF NOT EXISTS customer_sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pos_customer_cache (name TEXT PRIMARY KEY, json_data TEXT NOT NULL, synced_at TEXT NOT NULL);
  `);

  const insertMeta = database.prepare(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING"
  );

  insertMeta.run("schema_version", "1");
  insertMeta.run("created_at", new Date().toISOString());
}

export function upsertFbrItemConfig(rows: Record<string, unknown>[], serviceFee: number): void { if(!database)throw new Error("Database is not initialized.");const text=(r:Record<string,unknown>,k:string)=>typeof r[k]==="string"?r[k]:"";const num=(r:Record<string,unknown>,k:string)=>typeof r[k]==="number"?r[k]:null;const bool=(r:Record<string,unknown>,k:string)=>r[k]?1:0;const stmt=database.prepare(`INSERT INTO pos_fbr_item_config VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(item_code) DO UPDATE SET custom_fbr_tax_category=excluded.custom_fbr_tax_category,custom_fbr_hs_code=excluded.custom_fbr_hs_code,custom_mrp=excluded.custom_mrp,custom_is_3rd_schedule=excluded.custom_is_3rd_schedule,tax_rate=excluded.tax_rate,is_third_schedule=excluded.is_third_schedule,is_exempt=excluded.is_exempt,is_zero_rated=excluded.is_zero_rated,fbr_sale_type=excluded.fbr_sale_type,enabled=excluded.enabled,modified=excluded.modified`);database.transaction(()=>{for(const r of rows)stmt.run(text(r,"item_code"),text(r,"custom_fbr_tax_category"),text(r,"custom_fbr_hs_code"),num(r,"custom_mrp"),bool(r,"custom_is_3rd_schedule"),num(r,"tax_rate"),bool(r,"is_third_schedule"),bool(r,"is_exempt"),bool(r,"is_zero_rated"),text(r,"fbr_sale_type"),r.enabled===false?0:1,text(r,"modified"));const state=database!.prepare("INSERT INTO fbr_sync_state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");state.run("item_count",String(rows.length));state.run("service_fee",String(serviceFee));state.run("last_synced",new Date().toISOString());})(); }
export function getFbrSyncState():{itemCount:number;serviceFee:number;lastSynced:string|null;ready:boolean}{if(!database)return{itemCount:0,serviceFee:0,lastSynced:null,ready:false};const v=(k:string)=>(database!.prepare("SELECT value FROM fbr_sync_state WHERE key=?").get(k) as {value:string}|undefined)?.value??"";return{itemCount:Number(v("item_count"))||0,serviceFee:Number(v("service_fee"))||0,lastSynced:v("last_synced")||null,ready:true};}
export function getFbrItemConfigs(itemCodes:string[]):Record<string,Record<string,unknown>>{if(!database||!itemCodes.length)return{};const marks=itemCodes.map(()=>"?").join(",");const rows=database.prepare(`SELECT * FROM pos_fbr_item_config WHERE item_code IN (${marks})`).all(...itemCodes) as Record<string,unknown>[];return Object.fromEntries(rows.map(row=>[String(row.item_code),row]));}

export function saveSaleHistory(id:string,status:string,payload:Record<string,unknown>,response:Record<string,unknown>|null=null):void{if(!database)throw new Error("Database is not initialized.");const now=new Date().toISOString();database.prepare("INSERT INTO pos_sales_history VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(terminal_invoice_id) DO UPDATE SET pos_invoice=excluded.pos_invoice,status=excluded.status,payload_json=excluded.payload_json,response_json=excluded.response_json,submitted_at=excluded.submitted_at").run(id,typeof response?.pos_invoice==="string"?response.pos_invoice:null,status,JSON.stringify(payload),response?JSON.stringify(response):null,now,status==="Submitted"?now:null);}
export function getOpenTerminalInvoice(terminalId:string,createId:()=>string):string{if(!database)throw new Error("Database is not initialized.");const row=database.prepare("SELECT terminal_invoice_id FROM pos_sales_history WHERE status='Open' AND json_extract(payload_json, '$.terminal_id')=? ORDER BY created_at DESC LIMIT 1").get(terminalId) as {terminal_invoice_id:string}|undefined;if(row)return row.terminal_invoice_id;const id=createId();saveSaleHistory(id,"Open",{terminal_id:terminalId});return id;}

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
  database.prepare("INSERT INTO customer_sync_state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run("count", String(customers.length));
  database.prepare("INSERT INTO customer_sync_state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run("last_synced", new Date().toISOString());
}

export function getCustomerSyncState(): { count: number; lastSynced: string | null } { if (!database) return {count:0,lastSynced:null}; const value=(key:string)=>(database!.prepare("SELECT value FROM customer_sync_state WHERE key=?").get(key) as {value:string}|undefined)?.value??""; return { count:Number(value("count"))||0,lastSynced:value("last_synced")||null }; }
export function searchCustomers(query: string): Record<string, unknown>[] { if (!database || !query.trim()) return []; const q=`%${query}%`; return database.prepare("SELECT * FROM pos_customers WHERE disabled=0 AND (name LIKE ? OR customer_name LIKE ? OR mobile_no LIKE ? OR email_id LIKE ? OR tax_id LIKE ?) ORDER BY customer_name LIMIT 8").all(q,q,q,q,q) as Record<string,unknown>[]; }
export function findCustomerByNormalizedMobile(normalizedMobile: string): Record<string, unknown> | null { if(!database||!normalizedMobile)return null; const normalize=(value:string)=>{const digits=value.replace(/\D/g,"");if(digits.startsWith("92"))return `+${digits}`;if(digits.startsWith("0"))return `+92${digits.slice(1)}`;if(digits.length===10&&digits.startsWith("3"))return `+92${digits}`;return value.startsWith("+")?`+${digits}`:"";}; const rows=database.prepare("SELECT * FROM pos_customers WHERE mobile_no IS NOT NULL AND mobile_no <> ''").all() as Record<string,unknown>[]; return rows.find((row)=>normalize(String(row.mobile_no??""))===normalizedMobile)??null; }
export function cacheCustomer(name: string, data: Record<string, unknown>): void { if (!database) throw new Error("Database is not initialized."); database.prepare("INSERT INTO pos_customer_cache VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET json_data=excluded.json_data,synced_at=excluded.synced_at").run(name,JSON.stringify(data),new Date().toISOString()); }
export function getCachedCustomer(name: string): Record<string, unknown> | null { if (!database||!name)return null; const row=database.prepare("SELECT json_data FROM pos_customer_cache WHERE name=?").get(name) as {json_data:string}|undefined; try { const data=row?JSON.parse(row.json_data):null; return typeof data==="object"&&data&&!Array.isArray(data)?data as Record<string,unknown>:null; } catch{return null;} }

export function loadCartState(terminalId: string, openingEntry: string): CartState {
  if (!database) return { cartKey: "", lines: [] };
  const cartKey = `${terminalId}::${openingEntry}`;
  const row = database.prepare("SELECT json_data FROM pos_cart_state WHERE cart_key=?").get(cartKey) as { json_data: string } | undefined;
  if (!row) return { cartKey, lines: [] };
  try { const lines = JSON.parse(row.json_data); return { cartKey, lines: Array.isArray(lines) ? lines : [] }; } catch { return { cartKey, lines: [] }; }
}

export function saveCartState(terminalId: string, openingEntry: string, lines: unknown[]): void {
  if (!database) throw new Error("Database is not initialized.");
  const cartKey = `${terminalId}::${openingEntry}`;
  database.prepare(`INSERT INTO pos_cart_state VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(cart_key) DO UPDATE SET json_data=excluded.json_data,updated_at=excluded.updated_at`)
    .run(cartKey, terminalId, openingEntry, JSON.stringify(lines), new Date().toISOString());
}

export function upsertCatalog(data: {
  items: Record<string, unknown>[];
  prices: Record<string, unknown>[];
  stock: Record<string, unknown>[];
  barcodes: Record<string, unknown>[];
  totals: CatalogTotals;
  replaceBarcodes: boolean;
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
  const state = database.prepare("INSERT INTO catalog_sync_state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  database.transaction(() => {
    for (const row of data.items) item.run(text(row, "name"), text(row, "item_name"), text(row, "item_group"), text(row, "stock_uom"), bool(row, "is_stock_item"), bool(row, "is_sales_item"), bool(row, "disabled"), bool(row, "has_batch_no"), bool(row, "has_serial_no"), text(row, "modified"));
    for (const row of data.prices) price.run(text(row, "name"), text(row, "item_code"), text(row, "uom"), number(row, "price_list_rate"), text(row, "currency"), text(row, "valid_from"), text(row, "valid_upto"), text(row, "modified"));
    for (const row of data.stock) stock.run(text(row, "item_code"), text(row, "warehouse"), number(row, "actual_qty"), number(row, "reserved_qty"), number(row, "projected_qty"), text(row, "modified"));
    if (data.replaceBarcodes) database!.prepare("DELETE FROM pos_item_barcodes").run();
    for (const row of data.barcodes) barcode.run(text(row, "item_code") || text(row, "parent"), text(row, "barcode"), text(row, "uom"), text(row, "modified"));
    state.run("items", String(data.totals.items)); state.run("prices", String(data.totals.prices)); state.run("barcodes", String(data.totals.barcodes)); state.run("stock_rows", String(data.totals.stockRows)); state.run("last_synced", data.totals.lastSynced ?? "");
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
    (SELECT barcode FROM pos_item_barcodes WHERE parent=i.item_code AND barcode=? LIMIT 1) barcode,
    i.stock_uom uom, p.price_list_rate sellingPrice, p.currency currency, s.actual_qty actualStock, s.warehouse warehouse
    FROM pos_items i LEFT JOIN pos_item_prices p ON p.item_code=i.item_code
    LEFT JOIN pos_item_stock s ON s.item_code=i.item_code AND s.warehouse=?
    WHERE i.is_sales_item=1 AND i.disabled=0 AND (i.item_code LIKE ? OR i.item_name LIKE ? OR EXISTS (SELECT 1 FROM pos_item_barcodes b WHERE b.parent=i.item_code AND b.barcode=?))
    ORDER BY CASE WHEN i.item_code=? THEN 0 ELSE 1 END, i.item_name LIMIT 50`).all(query, warehouse, `%${query}%`, `%${query}%`, query, query) as CatalogSearchResult[];
}

export function lookupCatalog(query: string, warehouse: string): { exact: CatalogSearchResult | null; results: CatalogSearchResult[] } {
  if (!database || !query.trim()) return { exact: null, results: [] };
  const base = `SELECT i.item_code itemCode,i.item_name itemName,b.barcode barcode,COALESCE(b.uom,i.stock_uom) uom,p.price_list_rate sellingPrice,p.currency currency,s.actual_qty actualStock,s.warehouse warehouse FROM pos_items i LEFT JOIN pos_item_prices p ON p.item_code=i.item_code LEFT JOIN pos_item_stock s ON s.item_code=i.item_code AND s.warehouse=? LEFT JOIN pos_item_barcodes b ON b.parent=i.item_code AND b.barcode=? WHERE i.is_sales_item=1 AND i.disabled=0`;
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
      saveSetting.run(key, settings[key]);
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
    hasApiSecret: Boolean(settings.apiSecret)
  };
}

export function loadSettings(): AppSettings {
  const settings: AppSettings = {
    erpnextUrl: "",
    apiKey: "",
    apiSecret: "",
    terminalId: "",
    posProfile: "",
    branch: "",
    warehouse: ""
  };

  if (!database) {
    return settings;
  }

  const getSetting = database.prepare("SELECT value FROM app_settings WHERE key = ?");

  for (const key of settingKeys) {
    const row = getSetting.get(key) as { value: string } | undefined;
    settings[key] = row?.value ?? "";
  }

  return settings;
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
