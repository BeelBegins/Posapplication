import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { calculateFbrInvoice, calculateFbrItem } from "./domain/fbr-calculation";
import {
  cachePosProfile,
  cachePosBootstrap,
  cachePosSession,
  getCatalogTotals,
  getFbrSyncState,
  getFbrItemConfigs,
  getOpenTerminalInvoice,
  getCachedCustomer,
  getCustomerSyncState,
  findCustomerByNormalizedMobile,
  loadCartState,
  loadPaymentDraft,
  loadBenefitsDraft,
  saveBenefitsDraft,
  getDatabaseStatus,
  getPosBootstrap,
  getCachedPosSession,
  getPosProfileCacheStatus,
  getSettingsForRenderer,
  searchCatalog,
  lookupCatalog,
  searchCustomers,
  initDatabase,
  loadSettings,
  saveSettings
  ,upsertCatalog
  ,saveCartState
  ,savePaymentDraft
  ,upsertCustomers
  ,cacheCustomer
  ,saveSaleHistory
  ,upsertFbrItemConfig
  ,holdSale
  ,listHeldSales
  ,getHeldSale
  ,deleteHeldSale
  ,renameHeldSale
  ,listSalesHistory
  ,getSaleHistory
  ,recordReprint
  ,setSaleHistoryStatus
} from "./db/database";
import type { HeldSaleInput, SalesHistoryFilter } from "./db/database";

async function testServerReachability(): Promise<{ connected: boolean }> {
  const { erpnextUrl } = loadSettings();

  if (!erpnextUrl.trim()) {
    return { connected: false };
  }

  let endpoint: string;
  try {
    const baseUrl = new URL(erpnextUrl.trim()).toString().replace(/\/+$/, "");
    endpoint = `${baseUrl}/api/method/frappe.auth.get_logged_user`;
  } catch {
    return { connected: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    await fetch(endpoint, { method: "GET", signal: controller.signal });
    return { connected: true };
  } catch {
    return { connected: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function testApiAuthentication(): Promise<{ success: boolean; loggedUser: string | null }> {
  const { erpnextUrl, apiKey, apiSecret } = loadSettings();

  if (!erpnextUrl.trim() || !apiKey.trim() || !apiSecret.trim()) {
    return { success: false, loggedUser: null };
  }

  let endpoint: string;
  try {
    const baseUrl = new URL(erpnextUrl.trim()).toString().replace(/\/+$/, "");
    endpoint = `${baseUrl}/api/method/frappe.auth.get_logged_user`;
  } catch {
    return { success: false, loggedUser: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `token ${apiKey}:${apiSecret}` },
      signal: controller.signal
    });

    if (!response.ok) {
      return { success: false, loggedUser: null };
    }

    const body = await response.json() as { message?: unknown };
    if (typeof body.message !== "string" || !body.message) {
      return { success: false, loggedUser: null };
    }

    return { success: true, loggedUser: body.message };
  } catch {
    return { success: false, loggedUser: null };
  } finally {
    clearTimeout(timeout);
  }
}

interface PosProfileDetails {
  company: string;
  warehouse: string;
  branch: string;
  customer: string;
  priceList: string;
  currency: string;
  paymentMethodsCount: number;
}

interface PosProfileOption {
  name: string;
  company: string;
  warehouse: string;
}

interface PosConfigurationSummary {
  posProfile: string;
  company: string;
  branch: string;
  warehouse: string;
  defaultCustomer: string;
  sellingPriceList: string;
  currency: string;
  taxTemplate: string | null;
  taxRowsCount: number;
  paymentMethodsCount: number;
  lastSynced: string;
  cacheStatus: "Ready";
}

interface PosSessionSummary {
  sessionStatus: "Open" | "Not Open";
  openingEntry: string;
  user: string;
  startDateTime: string;
  openingBalanceRowsCount: number;
  lastSynced: string | null;
}

// Builds an error message from an already-read body — use when the response body has been consumed elsewhere.
function formatResponseError(status: number, statusText: string, rawBody: string): string {
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { /* non-JSON response */ }
  const messages: string[] = [];
  if (typeof body.message === "string") messages.push(body.message);
  if (typeof body._server_messages === "string") {
    try {
      const entries = JSON.parse(body._server_messages) as unknown[];
      for (const entry of entries) {
        const value = typeof entry === "string" ? JSON.parse(entry) as Record<string, unknown> : entry as Record<string, unknown>;
        if (typeof value?.message === "string") messages.push(value.message);
      }
    } catch { messages.push(body._server_messages); }
  }
  for (const key of ["exception", "exc_type", "exc"] as const) if (typeof body[key] === "string") messages.push(body[key] as string);
  const message = messages.find(Boolean) || rawBody || `HTTP ${status}: ${statusText}`;
  return `HTTP ${status}: ${message}`;
}

async function getResponseError(response: Response): Promise<string> {
  const rawBody = await response.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { /* non-JSON response */ }
  const messages: string[] = [];
  if (typeof body.message === "string") messages.push(body.message);
  if (typeof body._server_messages === "string") {
    try {
      const entries = JSON.parse(body._server_messages) as unknown[];
      for (const entry of entries) {
        const value = typeof entry === "string" ? JSON.parse(entry) as Record<string, unknown> : entry as Record<string, unknown>;
        if (typeof value?.message === "string") messages.push(value.message);
      }
    } catch { messages.push(body._server_messages); }
  }
  for (const key of ["exception", "exc_type", "exc"] as const) if (typeof body[key] === "string") messages.push(body[key] as string);
  const message = messages.find(Boolean) || rawBody || `HTTP ${response.status}: ${response.statusText}`;
  return `HTTP ${response.status}: ${message}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(record: Record<string, unknown> | null, key: string): string {
  return typeof record?.[key] === "string" ? record[key] as string : "";
}

async function fetchErpResource(baseUrl: string, apiKey: string, apiSecret: string, doctype: string, name: string): Promise<Record<string, unknown>> {
  const endpoint = `${baseUrl}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `token ${apiKey}:${apiSecret}` },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(await getResponseError(response));
    }
    const body = await response.json() as { data?: unknown; message?: unknown };
    const document = asRecord(body.data) ?? asRecord(body.message);
    if (!document) {
      throw new Error(`ERPNext returned no ${doctype} document.`);
    }
    return document;
  } finally {
    clearTimeout(timeout);
  }
}

async function getLoggedInUser(baseUrl: string, apiKey: string, apiSecret: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${baseUrl}/api/method/frappe.auth.get_logged_user`, {
      headers: { Authorization: `token ${apiKey}:${apiSecret}` },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(await getResponseError(response));
    }
    const body = await response.json() as { message?: unknown };
    if (typeof body.message !== "string" || !body.message) {
      throw new Error("ERPNext returned no logged-in user.");
    }
    return body.message;
  } finally {
    clearTimeout(timeout);
  }
}

function summarizePosSession(session: Record<string, unknown> | null): PosSessionSummary {
  if (!session) {
    return { sessionStatus: "Not Open", openingEntry: "", user: "", startDateTime: "", openingBalanceRowsCount: 0, lastSynced: null };
  }
  const date = textValue(session, "period_start_date") || textValue(session, "posting_date") || textValue(session, "creation");
  const time = textValue(session, "period_start_time");
  const balances = Array.isArray(session.balance_details) ? session.balance_details : [];
  return {
    sessionStatus: textValue(session, "status") === "Open" ? "Open" : "Not Open",
    openingEntry: textValue(session, "name"),
    user: textValue(session, "user"),
    startDateTime: [date, time].filter(Boolean).join(" ") || date,
    openingBalanceRowsCount: balances.length,
    lastSynced: textValue(session, "synced_at") || null
  };
}

async function syncPosSession(): Promise<{ success: boolean; summary: PosSessionSummary; error: string | null }> {
  const settings = loadSettings();
  if (!settings.erpnextUrl.trim() || !settings.apiKey.trim() || !settings.apiSecret.trim() || !settings.posProfile.trim()) {
    return { success: false, summary: summarizePosSession(null), error: "ERPNext URL, API Key, API Secret, and POS Profile are required." };
  }
  try {
    const baseUrl = new URL(settings.erpnextUrl.trim()).toString().replace(/\/+$/, "");
    const user = await getLoggedInUser(baseUrl, settings.apiKey, settings.apiSecret);
    const filters = JSON.stringify([
      ["pos_profile", "=", settings.posProfile],
      ["user", "=", user],
      ["status", "=", "Open"],
      ["docstatus", "=", 1]
    ]);
    const query = new URLSearchParams({ filters, fields: '["name"]', order_by: "modified desc", limit_page_length: "1" });
    const sessionController = new AbortController();
    const sessionTimeout = setTimeout(() => sessionController.abort(), 5_000);
    const response = await fetch(`${baseUrl}/api/resource/POS%20Opening%20Entry?${query.toString()}`, {
      headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}` },
      signal: sessionController.signal
    });
    clearTimeout(sessionTimeout);
    if (!response.ok) {
      throw new Error(await getResponseError(response));
    }
    const body = await response.json() as { data?: unknown };
    const entry = Array.isArray(body.data) ? asRecord(body.data[0]) : null;
    const openingEntry = textValue(entry, "name");
    if (!openingEntry) {
      return { success: true, summary: summarizePosSession(null), error: null };
    }
    const document = await fetchErpResource(baseUrl, settings.apiKey, settings.apiSecret, "POS Opening Entry", openingEntry);
    const syncedAt = new Date().toISOString();
    const cachedSession = { ...document, synced_at: syncedAt };
    cachePosSession(openingEntry, settings.posProfile, user, cachedSession, syncedAt);
    return { success: true, summary: summarizePosSession(cachedSession), error: null };
  } catch (error) {
    return { success: false, summary: summarizePosSession(null), error: error instanceof Error ? error.message : "POS Session Sync Failed." };
  }
}

async function getActivePosSession(): Promise<{ success:boolean; session:Record<string,unknown>|null; error:string|null; diagnosticReason:string; apiUser:string; requestedPosProfile:string; entries:Record<string,unknown>[] }>{const s=loadSettings();if(!s.erpnextUrl||!s.apiKey||!s.apiSecret)return {success:false,session:null,error:"Online connection required to load POS session.",diagnosticReason:"Missing ERPNext URL or API credentials",apiUser:"",requestedPosProfile:s.posProfile,entries:[]};try{const base=new URL(s.erpnextUrl).toString().replace(/\/+$/,"");const r=await fetch(`${base}/api/method/aimatic.offline_pos.api.get_active_pos_session?pos_profile=${encodeURIComponent(s.posProfile)}`,{headers:{Authorization:`token ${s.apiKey}:${s.apiSecret}`}});if(!r.ok){const error=await getResponseError(r);return {success:false,session:null,error,diagnosticReason:error,apiUser:"",requestedPosProfile:s.posProfile,entries:[]};}const b=await r.json() as {message?:unknown};const outer=asRecord(b.message);const payload=asRecord(outer?.message)??outer??{};const session=asRecord(payload.session);const entries=(Array.isArray(payload.submitted_open_entries)?payload.submitted_open_entries:Array.isArray(payload.open_entries)?payload.open_entries:[]).map(asRecord).filter((x):x is Record<string,unknown>=>Boolean(x));const diagnosticReason=textValue(payload,"diagnostic_reason")||textValue(payload,"reason")||(session?"Active session returned":"No active POS Opening Entry returned by server");const apiUser=textValue(payload,"api_user")||textValue(payload,"user");if(session){const entry=textValue(session,"opening_entry")||textValue(session,"name");if(entry)cachePosSession(entry,s.posProfile,textValue(session,"user"),session,new Date().toISOString());}return {success:true,session,error:null,diagnosticReason,apiUser,requestedPosProfile:textValue(payload,"pos_profile")||s.posProfile,entries};}catch(e){const error=e instanceof Error?e.message:"Unable to load POS session.";return {success:false,session:null,error,diagnosticReason:error,apiUser:"",requestedPosProfile:s.posProfile,entries:[]};}}
async function startPosSession(input:Record<string,unknown>):Promise<{success:boolean;session:Record<string,unknown>|null;error:string|null}>{const s=loadSettings();if(!s.erpnextUrl||!s.apiKey||!s.apiSecret)return {success:false,session:null,error:"Online connection required to start shift"};try{const base=new URL(s.erpnextUrl).toString().replace(/\/+$/,"");const r=await fetch(`${base}/api/method/aimatic.offline_pos.api.start_pos_session`,{method:"POST",headers:{Authorization:`token ${s.apiKey}:${s.apiSecret}`,"Content-Type":"application/json"},body:JSON.stringify({pos_profile:s.posProfile,opening_balances:JSON.stringify(Array.isArray(input.opening_balances)?input.opening_balances:[])})});if(!r.ok)return {success:false,session:null,error:await getResponseError(r)};const b=await r.json() as {message?:unknown};const raw=asRecord(b.message);const session=asRecord(raw?.message)??raw;const entry=textValue(session,"opening_entry")||textValue(session,"name");if(!session||!entry)return {success:false,session:null,error:"Server returned no Opening Entry."};cachePosSession(entry,s.posProfile,textValue(session,"user"),session,new Date().toISOString());return {success:true,session,error:null};}catch(e){return {success:false,session:null,error:e instanceof Error?e.message:"Unable to start shift."};}}

function getCachedSessionSummary(): PosSessionSummary {
  return summarizePosSession(getCachedPosSession(loadSettings().posProfile));
}

function getCartIdentity(): { terminalId: string; openingEntry: string } {
  const settings = loadSettings();
  const session = getCachedSessionSummary();
  return { terminalId: settings.terminalId || "default-terminal", openingEntry: session.openingEntry || "no-opening-entry" };
}
function getTerminalInvoiceId():string{const id=getCartIdentity();return getOpenTerminalInvoice(id.terminalId,()=>`${id.terminalId}-${randomUUID()}`);}
async function submitOnlineSale(input:Record<string,unknown>):Promise<{success:boolean;response:Record<string,unknown>|null;error:string|null}>{const settings=loadSettings();const id=String(input.terminal_invoice_id||getTerminalInvoiceId());const identity=getCartIdentity();const payload={terminal_invoice_id:id,terminal_id:identity.terminalId,pos_profile:settings.posProfile,opening_entry:identity.openingEntry,customer:String(input.customer??""),items:Array.isArray(input.items)?input.items:[],payments:Array.isArray(input.payments)?input.payments:[],coupon_code:String(input.coupon_code??""),redeem_loyalty_points:Boolean(input.redeem_loyalty_points),loyalty_points:Number(input.loyalty_points??0)};saveSaleHistory(id,"Submitting",payload);if(!settings.erpnextUrl||!settings.apiKey||!settings.apiSecret){saveSaleHistory(id,"Failed",payload);return {success:false,response:null,error:"Offline sale queue is not implemented yet. Sale remains open."};}try{const base=new URL(settings.erpnextUrl).toString().replace(/\/+$/,"");const response=await fetch(`${base}/api/method/aimatic.offline_pos.api.submit_online_sale`,{method:"POST",headers:{Authorization:`token ${settings.apiKey}:${settings.apiSecret}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});const rawBody=await response.text();let parsed:{message?:unknown;data?:unknown}={};try{parsed=JSON.parse(rawBody) as {message?:unknown;data?:unknown};}catch{/* non-JSON response */}const result=asRecord(parsed.message)??asRecord(parsed.data)??{};if(!response.ok){saveSaleHistory(id,"Failed",payload,result);return {success:false,response:result,error:formatResponseError(response.status,response.statusText,rawBody)};}saveSaleHistory(id,"Submitted",payload,result);return {success:true,response:result,error:null};}catch(error){saveSaleHistory(id,"Failed",payload);return {success:false,response:null,error:error instanceof Error?error.message:"Sale submission failed."};}}
async function findPosInvoicePrintFormat(base: string, apiKey: string, apiSecret: string): Promise<string> {
  try {
    const query = new URLSearchParams({ filters: JSON.stringify([["doc_type", "=", "POS Invoice"], ["disabled", "=", 0]]), fields: JSON.stringify(["name", "standard"]), limit_page_length: "50" });
    const response = await fetch(`${base}/api/resource/Print%20Format?${query.toString()}`, { headers: { Authorization: `token ${apiKey}:${apiSecret}` } });
    if (!response.ok) return "";
    const body = await response.json() as { data?: unknown };
    const rows = Array.isArray(body.data) ? body.data.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row)) : [];
    const custom = rows.find((row) => textValue(row, "standard") === "No"); // prefer a customised thermal format over the standard one
    return textValue(custom ?? rows[0] ?? null, "name");
  } catch {
    return "";
  }
}

// The receipt is an ERPNext Print Format (POS Invoice), not a custom API method — render it via the standard print view.
async function getPosReceipt(posInvoice: string): Promise<{ html: string | null; error: string | null }> {
  const s = loadSettings();
  if (!s.erpnextUrl || !s.apiKey || !s.apiSecret) return { html: null, error: "Online connection required to load receipt." };
  if (!posInvoice.trim()) return { html: null, error: "Missing POS Invoice name." };
  try {
    const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
    const printFormat = await findPosInvoicePrintFormat(base, s.apiKey, s.apiSecret);
    const params = new URLSearchParams({ doctype: "POS Invoice", name: posInvoice, no_letterhead: "1", trigger_print: "0", _lang: "en" });
    if (printFormat) params.set("format", printFormat);
    const response = await fetch(`${base}/printview?${params.toString()}`, { headers: { Authorization: `token ${s.apiKey}:${s.apiSecret}` } });
    if (!response.ok) return { html: null, error: await getResponseError(response) };
    const html = await response.text();
    if (!html || !html.trim()) return { html: null, error: "Receipt HTML was not returned." };
    // The /printview page carries Frappe's print toolbar (Get PDF / Print / Menu / Letterhead) and page chrome — hide it so only the receipt shows.
    const hideChrome = "<style>.print-toolbar,.page-head,.navbar,#navbar,.web-footer,footer,.btn-print-preview,.print-preview-select{display:none!important;}body{background:#fff!important;margin:0!important;}</style>";
    const clean = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${hideChrome}</head>`) : hideChrome + html;
    return { html: clean, error: null };
  } catch (e) {
    return { html: null, error: e instanceof Error ? e.message : "Unable to load receipt." };
  }
}

async function printReceiptHtml(html: string): Promise<{ success: boolean; error: string | null }> {
  if (!html.trim()) return { success: false, error: "No receipt content to print." };
  return new Promise((resolve) => {
    const printWindow = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    let settled = false;
    const finish = (result: { success: boolean; error: string | null }) => {
      if (settled) return;
      settled = true;
      if (!printWindow.isDestroyed()) printWindow.close();
      resolve(result);
    };
    printWindow.webContents.once("did-finish-load", () => {
      printWindow.webContents.print({ silent: false, printBackground: true }, (ok, failureReason) => {
        finish({ success: ok, error: ok ? null : (failureReason || "Printing was cancelled.") });
      });
    });
    printWindow.webContents.once("did-fail-load", (_event, _code, description) => finish({ success: false, error: description || "Receipt failed to load for printing." }));
    void printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

// Duplicate receipt: same authoritative receipt HTML with a DUPLICATE COPY banner. Never re-submits anything.
async function getDuplicateReceipt(posInvoice: string): Promise<{ html: string | null; error: string | null }> {
  const base = await getPosReceipt(posInvoice);
  if (!base.html) return base;
  const banner = `<div style="text-align:center;font:700 14px Arial,sans-serif;border:2px dashed #b91c1c;color:#b91c1c;padding:6px;margin:6px;letter-spacing:2px;">DUPLICATE COPY — Invoice ${posInvoice} — Reprinted ${new Date().toLocaleString()}</div>`;
  const html = /<body[^>]*>/i.test(base.html) ? base.html.replace(/(<body[^>]*>)/i, `$1${banner}`) : banner + base.html;
  return { html, error: null };
}

function toHeldInput(raw: Record<string, unknown>): HeldSaleInput {
  return {
    terminalInvoiceId: String(raw.terminalInvoiceId ?? ""), displayName: String(raw.displayName ?? ""),
    customer: String(raw.customer ?? ""), customerName: String(raw.customerName ?? ""),
    posProfile: String(raw.posProfile ?? ""), company: String(raw.company ?? ""), branch: String(raw.branch ?? ""), openingEntry: String(raw.openingEntry ?? ""),
    cart: Array.isArray(raw.cart) ? raw.cart : [], payments: Array.isArray(raw.payments) ? raw.payments : [],
    benefits: asRecord(raw.benefits) ?? {}, totals: asRecord(raw.totals) ?? {}, validationSnapshot: asRecord(raw.validationSnapshot) ?? {},
    itemCount: Number(raw.itemCount) || 0, estimatedTotal: Number(raw.estimatedTotal) || 0
  };
}
function toHistoryFilter(raw: Record<string, unknown>): SalesHistoryFilter {
  return { search: String(raw.search ?? ""), dateFrom: String(raw.dateFrom ?? ""), dateTo: String(raw.dateTo ?? ""), limit: Number(raw.limit) || 50, offset: Number(raw.offset) || 0 };
}

function getPaymentMethods(): string[] { const profile=asRecord(getPosBootstrap(loadSettings().posProfile)?.pos_profile); const rows=Array.isArray(profile?.payments)?profile.payments:[]; return [...new Set(rows.map(asRecord).map((row)=>textValue(row,"mode_of_payment")).filter(Boolean))]; }

async function fetchPagedList(baseUrl: string, apiKey: string, apiSecret: string, doctype: string, fields: string[], filters?: unknown): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let start = 0; ; start += 500) {
    const query = new URLSearchParams({ fields: JSON.stringify(fields), limit_start: String(start), limit_page_length: "500" });
    if (filters) query.set("filters", JSON.stringify(filters));
    const response = await fetch(`${baseUrl}/api/resource/${encodeURIComponent(doctype)}?${query.toString()}`, {
      headers: { Authorization: `token ${apiKey}:${apiSecret}` }
    });
    if (!response.ok) throw new Error(await getResponseError(response));
    const body = await response.json() as { data?: unknown };
    const page = Array.isArray(body.data) ? body.data.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row)) : [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

async function fetchItemBarcodePages(baseUrl: string, apiKey: string, apiSecret: string, sendProgress: (message: string) => void): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let start = 0; ; start += 500) {
    const query = new URLSearchParams({ limit_start: String(start), limit_page_length: "500" });
    const response = await fetch(`${baseUrl}/api/method/aimatic.offline_pos.api.get_item_barcodes?${query.toString()}`, {
      headers: { Authorization: `token ${apiKey}:${apiSecret}` }
    });
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

async function syncCustomers(): Promise<{ success: boolean; state: ReturnType<typeof getCustomerSyncState>; error: string | null }> {
  const settings=loadSettings(); if(!settings.erpnextUrl||!settings.apiKey||!settings.apiSecret) return {success:false,state:getCustomerSyncState(),error:"ERPNext URL and API credentials are required."};
  try { const base=new URL(settings.erpnextUrl).toString().replace(/\/+$/,""); const customers=await fetchPagedList(base,settings.apiKey,settings.apiSecret,"Customer",["name","customer_name","customer_group","territory","mobile_no","email_id","tax_id","disabled","modified"],[["disabled","=",0]]); upsertCustomers(customers); return {success:true,state:getCustomerSyncState(),error:null}; } catch(error) { return {success:false,state:getCustomerSyncState(),error:error instanceof Error?error.message:"Customer sync failed."}; }
}

async function loadCustomer(name: string): Promise<{ customer: Record<string, unknown> | null; cached: boolean; error: string | null }> {
  const settings=loadSettings(); const cached=getCachedCustomer(name);
  if(!settings.erpnextUrl||!settings.apiKey||!settings.apiSecret) return {customer:cached,cached:true,error:cached?null:"Customer not cached."};
  try { const base=new URL(settings.erpnextUrl).toString().replace(/\/+$/,""); const customer=await fetchErpResource(base,settings.apiKey,settings.apiSecret,"Customer",name); cacheCustomer(name,customer); return {customer,cached:false,error:null}; } catch(error) { return {customer:cached,cached:true,error:error instanceof Error?error.message:"Unable to load customer."}; }
}

async function getCustomerCreationOptions(): Promise<{ groups: string[]; territories: string[]; error: string | null }> {
  const settings=loadSettings(); if(!settings.erpnextUrl||!settings.apiKey||!settings.apiSecret) return {groups:[],territories:[],error:"Online connection required to create a customer."};
  try { const base=new URL(settings.erpnextUrl).toString().replace(/\/+$/,""); const [groups,territories]=await Promise.all([fetchPagedList(base,settings.apiKey,settings.apiSecret,"Customer Group",["name"],[["is_group","=",0]]),fetchPagedList(base,settings.apiKey,settings.apiSecret,"Territory",["name"],[["is_group","=",0]])]); return {groups:groups.map((x)=>textValue(x,"name")).filter(Boolean),territories:territories.map((x)=>textValue(x,"name")).filter(Boolean),error:null}; } catch(error) { return {groups:[],territories:[],error:error instanceof Error?error.message:"Unable to load customer options."}; }
}

async function createCustomer(input: Record<string, unknown>): Promise<{ customer: Record<string, unknown> | null; error: string | null }> {
  const settings=loadSettings(); if(!settings.erpnextUrl||!settings.apiKey||!settings.apiSecret) return {customer:null,error:"Online connection required to create a customer."};
  try { const base=new URL(settings.erpnextUrl).toString().replace(/\/+$/,""); const rawMobile=String(input.mobile_no??"").trim(); const digits=rawMobile.replace(/\D/g,""); const mobileNo=!digits?"":digits.startsWith("92")?`+${digits}`:digits.startsWith("0")?`+92${digits.slice(1)}`:digits.length===10&&digits.startsWith("3")?`+92${digits}`:rawMobile; const existing=mobileNo?findCustomerByNormalizedMobile(mobileNo):null; if(existing)return {customer:null,error:`Mobile number already exists for Customer: ${textValue(existing,"name")}`}; const profile=asRecord(getPosBootstrap(settings.posProfile)?.pos_profile); const priceList=textValue(profile,"selling_price_list"); const payload:Record<string,string>={customer_name:String(input.customer_name??""),customer_type:"Individual",customer_group:String(input.customer_group??""),territory:String(input.territory??""),mobile_no:mobileNo,email_id:String(input.email_id??""),tax_id:String(input.tax_id??"")}; if(priceList)payload.default_price_list=priceList; if(!payload.customer_name) return {customer:null,error:"Customer Name is required."}; const response=await fetch(`${base}/api/resource/Customer`,{method:"POST",headers:{Authorization:`token ${settings.apiKey}:${settings.apiSecret}`,"Content-Type":"application/json"},body:JSON.stringify(payload)}); if(!response.ok){const message=await getResponseError(response);return {customer:null,error:/mobile/i.test(message)&&/duplicate|already|exists/i.test(message)?`Duplicate mobile number: ${message}`:message};} const body=await response.json() as {data?:unknown}; const customer=asRecord(body.data); if(!customer)return {customer:null,error:"ERPNext returned no Customer document."}; cacheCustomer(textValue(customer,"name"),customer); upsertCustomers([customer]); return {customer,error:null}; } catch(error){return {customer:null,error:error instanceof Error?error.message:"Unable to create customer."};}
}

async function previewCart(input: Record<string, unknown>): Promise<{ preview: Record<string, unknown> | null; error: string | null }> {
  const settings = loadSettings();
  if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret) return { preview: null, error: "Offline Estimate — Not Server Validated" };
  try {
    const base = new URL(settings.erpnextUrl).toString().replace(/\/+$/, "");
    const payload: Record<string, unknown> = {
      pos_profile: String(input.pos_profile ?? settings.posProfile),
      customer: String(input.customer ?? ""),
      items: Array.isArray(input.items) ? input.items : []
    };
    if (input.coupon_code) payload.coupon_code = String(input.coupon_code);
    if (input.redeem_loyalty_points) payload.redeem_loyalty_points = input.redeem_loyalty_points;
    if (input.loyalty_points) payload.loyalty_points = input.loyalty_points;
    const response = await fetch(`${base}/api/method/aimatic.offline_pos.api.preview_cart`, {
      method: "POST",
      headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return { preview: null, error: await getResponseError(response) };
    const body = await response.json() as { message?: unknown; data?: unknown };
    const rawPreview = asRecord(body.message) ?? asRecord(body.data);
    const preview = asRecord(rawPreview?.message) ?? rawPreview;
    return preview ? { preview, error: null } : { preview: null, error: "Cart preview returned no data." };
  } catch (error) {
    return { preview: null, error: error instanceof Error ? error.message : "Offline Estimate — Not Server Validated" };
  }
}

async function syncItemCatalog(sendProgress: (message: string) => void): Promise<{ success: boolean; totals: ReturnType<typeof getCatalogTotals>; barcodeError: string | null; error: string | null }> {
  const settings = loadSettings();
  const bootstrap = getPosBootstrap(settings.posProfile);
  const profile = asRecord(bootstrap?.pos_profile);
  const priceList = textValue(profile, "selling_price_list");
  const warehouse = textValue(profile, "warehouse");
  const currency = textValue(profile, "currency");
  if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !priceList || !warehouse || !currency) {
    return { success: false, totals: getCatalogTotals(), barcodeError: null, error: "Cached POS Profile configuration is required." };
  }
  try {
    const baseUrl = new URL(settings.erpnextUrl).toString().replace(/\/+$/, "");
    sendProgress("Syncing items...");
    const items = await fetchPagedList(baseUrl, settings.apiKey, settings.apiSecret, "Item", ["name", "item_name", "item_group", "stock_uom", "is_stock_item", "is_sales_item", "disabled", "has_batch_no", "has_serial_no", "modified"]);
    sendProgress(`Items: ${items.length}. Syncing prices...`);
    const prices = await fetchPagedList(baseUrl, settings.apiKey, settings.apiSecret, "Item Price", ["name", "item_code", "uom", "price_list_rate", "currency", "valid_from", "valid_upto", "modified"], [["price_list", "=", priceList], ["selling", "=", 1]]);
    sendProgress(`Prices: ${prices.length}. Syncing stock...`);
    const stock = await fetchPagedList(baseUrl, settings.apiKey, settings.apiSecret, "Bin", ["item_code", "warehouse", "actual_qty", "reserved_qty", "projected_qty", "modified"], [["warehouse", "=", warehouse]]);
    let barcodes: Record<string, unknown>[] = [];
    let barcodeError: string | null = null;
    try {
      sendProgress("Syncing barcodes...");
      barcodes = await fetchItemBarcodePages(baseUrl, settings.apiKey, settings.apiSecret, sendProgress);
    } catch (error) {
      barcodeError = error instanceof Error ? error.message : "Unable to sync Item Barcode.";
    }
    const previousTotals = getCatalogTotals();
    const totals = { items: items.length, prices: prices.length, barcodes: barcodeError ? previousTotals.barcodes : barcodes.length, stockRows: stock.length, lastSynced: new Date().toISOString() };
    upsertCatalog({ items, prices, stock, barcodes, totals, replaceBarcodes: !barcodeError });
    sendProgress("Catalog sync complete.");
    return { success: true, totals, barcodeError, error: null };
  } catch (error) {
    return { success: false, totals: getCatalogTotals(), barcodeError: null, error: error instanceof Error ? error.message : "Catalog sync failed." };
  }
}

async function syncFbrConfig():Promise<{success:boolean;state:ReturnType<typeof getFbrSyncState>;error:string|null}>{const s=loadSettings();if(!s.erpnextUrl||!s.apiKey||!s.apiSecret)return{success:false,state:getFbrSyncState(),error:"Online connection required for FBR configuration sync."};try{const base=new URL(s.erpnextUrl).toString().replace(/\/+$/,"");let start=0;let fee=0;const rows:Record<string,unknown>[]=[];for(;;){const q=new URLSearchParams({limit_start:String(start),limit_page_length:"500"});const r=await fetch(`${base}/api/method/aimatic.offline_pos.api.get_pos_fbr_item_config?${q}`,{headers:{Authorization:`token ${s.apiKey}:${s.apiSecret}`}});if(!r.ok)throw new Error(await getResponseError(r));const b=await r.json() as {message?:unknown};const m=asRecord(b.message);const page=Array.isArray(m?.rows)?m.rows.map(asRecord).filter((x):x is Record<string,unknown>=>x!==null&&typeof x.item_code==="string"):[];rows.push(...page);if(typeof m?.service_fee==="number")fee=m.service_fee;if(!m?.has_more)break;start=typeof m?.next_start==="number"?m.next_start:start+500;}upsertFbrItemConfig(rows,fee);return{success:true,state:getFbrSyncState(),error:null};}catch(e){return{success:false,state:getFbrSyncState(),error:e instanceof Error?e.message:"FBR configuration sync failed."};}}

function summarizePosConfiguration(configuration: Record<string, unknown>): PosConfigurationSummary | null {
  const profile = asRecord(configuration.pos_profile);
  if (!profile) {
    return null;
  }
  const taxTemplate = asRecord(configuration.tax_template);
  const paymentModes = Array.isArray(configuration.payment_modes) ? configuration.payment_modes : [];
  const taxRows = Array.isArray(taxTemplate?.taxes) ? taxTemplate.taxes : [];
  const syncedAt = textValue(configuration, "synced_at");

  if (!syncedAt) {
    return null;
  }

  return {
    posProfile: textValue(profile, "name"),
    company: textValue(profile, "company"),
    branch: textValue(profile, "branch") || textValue(profile, "custom_branch"),
    warehouse: textValue(profile, "warehouse"),
    defaultCustomer: textValue(profile, "customer"),
    sellingPriceList: textValue(profile, "selling_price_list"),
    currency: textValue(profile, "currency"),
    taxTemplate: taxTemplate ? textValue(taxTemplate, "name") || textValue(profile, "taxes_and_charges") : null,
    taxRowsCount: taxRows.length,
    paymentMethodsCount: paymentModes.length,
    lastSynced: syncedAt,
    cacheStatus: "Ready"
  };
}

async function syncPosConfiguration(): Promise<{ success: boolean; summary: PosConfigurationSummary | null; error: string | null }> {
  const settings = loadSettings();
  const { erpnextUrl, apiKey, apiSecret, posProfile } = settings;
  if (!erpnextUrl.trim() || !apiKey.trim() || !apiSecret.trim() || !posProfile.trim()) {
    return { success: false, summary: null, error: "ERPNext URL, API Key, API Secret, and POS Profile are required." };
  }

  try {
    const baseUrl = new URL(erpnextUrl.trim()).toString().replace(/\/+$/, "");
    const profile = await fetchErpResource(baseUrl, apiKey, apiSecret, "POS Profile", posProfile);
    const companyName = textValue(profile, "company");
    const taxTemplateName = textValue(profile, "taxes_and_charges");
    const company = companyName ? await fetchErpResource(baseUrl, apiKey, apiSecret, "Company", companyName) : null;
    const taxTemplate = taxTemplateName
      ? await fetchErpResource(baseUrl, apiKey, apiSecret, "Sales Taxes and Charges Template", taxTemplateName)
      : null;
    const paymentNames = [...new Set(
      (Array.isArray(profile.payments) ? profile.payments : [])
        .map(asRecord)
        .map((payment) => textValue(payment, "mode_of_payment"))
        .filter(Boolean)
    )];
    const paymentModes = await Promise.all(
      paymentNames.map((paymentName) => fetchErpResource(baseUrl, apiKey, apiSecret, "Mode of Payment", paymentName))
    );
    const syncedAt = new Date().toISOString();
    const configuration: Record<string, unknown> = {
      pos_profile: profile,
      company,
      tax_template: taxTemplate,
      payment_modes: paymentModes,
      synced_at: syncedAt
    };
    const branch = textValue(profile, "branch") || textValue(profile, "custom_branch");
    saveSettings({ ...settings, branch });
    cachePosBootstrap(posProfile, configuration, syncedAt);

    return { success: true, summary: summarizePosConfiguration(configuration), error: null };
  } catch (error) {
    return { success: false, summary: null, error: error instanceof Error ? error.message : "POS Configuration Sync Failed." };
  }
}

function getCachedPosConfiguration(): PosConfigurationSummary | null {
  const { posProfile } = loadSettings();
  const configuration = getPosBootstrap(posProfile);
  return configuration ? summarizePosConfiguration(configuration) : null;
}

async function loadAvailablePosProfiles(): Promise<{ success: boolean; profiles: PosProfileOption[]; error: string | null }> {
  const { erpnextUrl, apiKey, apiSecret } = loadSettings();

  if (!erpnextUrl.trim() || !apiKey.trim() || !apiSecret.trim()) {
    return { success: false, profiles: [], error: "ERPNext URL, API Key, and API Secret are required." };
  }

  let endpoint: string;
  try {
    const baseUrl = new URL(erpnextUrl.trim()).toString().replace(/\/+$/, "");
    const query = new URLSearchParams({
      fields: '["name","company","warehouse"]',
      limit_page_length: "100"
    });
    endpoint = `${baseUrl}/api/resource/POS%20Profile?${query.toString()}`;
  } catch {
    return { success: false, profiles: [], error: "ERPNext URL is not valid." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `token ${apiKey}:${apiSecret}` },
      signal: controller.signal
    });

    if (!response.ok) {
      return { success: false, profiles: [], error: await getResponseError(response) };
    }

    const body = await response.json() as { data?: unknown };
    if (!Array.isArray(body.data)) {
      return { success: false, profiles: [], error: "ERPNext returned no POS Profile list." };
    }

    const profiles = body.data.flatMap((profile): PosProfileOption[] => {
      if (typeof profile !== "object" || profile === null || Array.isArray(profile)) {
        return [];
      }
      const record = profile as Record<string, unknown>;
      if (typeof record.name !== "string") {
        return [];
      }
      return [{
        name: record.name,
        company: typeof record.company === "string" ? record.company : "",
        warehouse: typeof record.warehouse === "string" ? record.warehouse : ""
      }];
    });

    return { success: true, profiles, error: null };
  } catch (error) {
    return {
      success: false,
      profiles: [],
      error: error instanceof Error ? error.message : "Unable to load POS Profiles."
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadPosProfile(): Promise<{ success: boolean; profile: PosProfileDetails | null; error: string | null; syncedAt: string | null }> {
  const settings = loadSettings();
  const { erpnextUrl, apiKey, apiSecret, posProfile } = settings;

  if (!erpnextUrl.trim() || !apiKey.trim() || !apiSecret.trim() || !posProfile.trim()) {
    return { success: false, profile: null, error: "ERPNext URL, API Key, API Secret, and POS Profile are required.", syncedAt: null };
  }

  let endpoint: string;
  try {
    const baseUrl = new URL(erpnextUrl.trim()).toString().replace(/\/+$/, "");
    endpoint = `${baseUrl}/api/resource/POS%20Profile/${encodeURIComponent(posProfile.trim())}`;
  } catch {
    return { success: false, profile: null, error: "ERPNext URL is not valid.", syncedAt: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `token ${apiKey}:${apiSecret}` },
      signal: controller.signal
    });

    if (!response.ok) {
      return { success: false, profile: null, error: await getResponseError(response), syncedAt: null };
    }

    const body = await response.json() as { data?: unknown; message?: unknown };
    const profileData = typeof body.data === "object" && body.data !== null && !Array.isArray(body.data)
      ? body.data as Record<string, unknown>
      : typeof body.message === "object" && body.message !== null && !Array.isArray(body.message)
        ? body.message as Record<string, unknown>
        : null;

    if (!profileData) {
      return { success: false, profile: null, error: "ERPNext returned no POS Profile data.", syncedAt: null };
    }

    const value = (key: string): string => typeof profileData[key] === "string" ? profileData[key] as string : "";
    const paymentMethods = Array.isArray(profileData.payments)
      ? profileData.payments
      : Array.isArray(profileData.payment_methods)
        ? profileData.payment_methods
        : [];
    const branch = value("branch") || value("custom_branch");

    saveSettings({ ...settings, branch });
    const syncedAt = cachePosProfile(value("name") || posProfile, profileData);

    return {
      success: true,
      error: null,
      syncedAt,
      profile: {
        company: value("company"),
        warehouse: value("warehouse"),
        branch,
        customer: value("customer"),
        priceList: value("selling_price_list"),
        currency: value("currency"),
        paymentMethodsCount: paymentMethods.length
      }
    };
  } catch (error) {
    return {
      success: false,
      profile: null,
      error: error instanceof Error ? error.message : "Unable to load POS Profile.",
      syncedAt: null
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getCustomerBenefits(customerName: string): Promise<{ loyaltyProgram: string | null; availablePoints: number; conversionFactor: number; error: string | null }> {
  const settings = loadSettings();
  if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !customerName) {
    return { loyaltyProgram: null, availablePoints: 0, conversionFactor: 1, error: null };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const baseUrl = new URL(settings.erpnextUrl.trim()).toString().replace(/\/+$/, "");
    const query = new URLSearchParams({ customer: customerName });
    const response = await fetch(`${baseUrl}/api/method/aimatic.offline_pos.api.get_customer_benefits?${query.toString()}`, {
      headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}` },
      signal: controller.signal
    });
    if (!response.ok) {
      return { loyaltyProgram: null, availablePoints: 0, conversionFactor: 1, error: await getResponseError(response) };
    }
    const body = await response.json() as { message?: unknown };
    const data = asRecord(body.message);
    return {
      loyaltyProgram: textValue(data, "loyalty_program") || null,
      availablePoints: typeof data?.available_loyalty_points === "number" ? data.available_loyalty_points as number : 0,
      conversionFactor: typeof data?.conversion_factor === "number" ? data.conversion_factor as number : 1,
      error: null
    };
  } catch (error) {
    return { loyaltyProgram: null, availablePoints: 0, conversionFactor: 1, error: error instanceof Error ? error.message : "Unable to load customer benefits." };
  } finally {
    clearTimeout(timeout);
  }
}

async function validateCoupon(couponCode: string): Promise<{ couponName: string | null; discountAmount: number; error: string | null }> {
  const settings = loadSettings();
  if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !couponCode) {
    return { couponName: null, discountAmount: 0, error: "Online connection required to validate coupon." };
  }
  try {
    const baseUrl = new URL(settings.erpnextUrl.trim()).toString().replace(/\/+$/, "");
    const coupon = await fetchErpResource(baseUrl, settings.apiKey, settings.apiSecret, "Coupon Code", couponCode);
    const couponName = textValue(coupon, "name") || couponCode;
    const discountAmount = typeof coupon.discount_amount === "number" ? coupon.discount_amount as number : 0;
    return { couponName, discountAmount, error: null };
  } catch (error) {
    return { couponName: null, discountAmount: 0, error: error instanceof Error ? error.message : "Invalid coupon code." };
  }
}

type FbrCalculatedRow = { success: true; item_code: string; quantity: number; inclusiveAmount: number; taxRate: number; salesTax: number; valueExcludingTax: number; retailPrice: number; isThirdSchedule: boolean } | { success: false; item_code: string; error: string };
function isSuccessfulFbrRow(row: FbrCalculatedRow): row is Extract<FbrCalculatedRow, { success: true }> { return row.success === true; }
function calculateFbrCart(input:Record<string,unknown>):Record<string,unknown>{const items=Array.isArray(input.items)?input.items.map(asRecord).filter((x):x is Record<string,unknown>=>x!==null):[];const configs=getFbrItemConfigs(items.map(x=>String(x.item_code??"")));const state=getFbrSyncState();const rows:FbrCalculatedRow[]=items.map(item=>{const code=String(item.item_code??"");const c=configs[code];if(!c)return{success:false,item_code:code,error:`FBR Tax Category is missing for ${code}`};if(c.enabled===0)return{success:false,item_code:code,error:`FBR Tax Category is disabled for ${code}`};try{const result=calculateFbrItem({itemCode:code,qty:Number(item.qty)||0,rate:Number(item.rate)||0,amount:Number(item.amount)||undefined,taxRate:Number(c.tax_rate)||0,isExempt:Boolean(c.is_exempt),isZeroRated:Boolean(c.is_zero_rated),isThirdSchedule:Boolean(c.is_third_schedule||c.custom_is_3rd_schedule),mrp:Number(c.custom_mrp)||undefined,taxCategory:String(c.custom_fbr_tax_category||""),hsCode:String(c.custom_fbr_hs_code||"")});return{success:true,item_code:code,quantity:result.quantity,inclusiveAmount:result.inclusiveAmount,taxRate:result.taxRate,salesTax:result.salesTax,valueExcludingTax:result.valueExcludingTax,retailPrice:result.retailPrice,isThirdSchedule:result.isThirdSchedule};}catch(e){return{success:false,item_code:code,error:e instanceof Error?e.message:"FBR calculation failed"};}});const validRows=rows.filter(isSuccessfulFbrRow);const valid=validRows.map(r=>({itemCode:r.item_code,qty:r.quantity,rate:Number((items.find(i=>String(i.item_code)===r.item_code)?.rate)||0),amount:r.inclusiveAmount,taxRate:r.taxRate,isThirdSchedule:r.isThirdSchedule,mrp:r.retailPrice/(r.quantity||1)}));const totals=calculateFbrInvoice(valid,state.serviceFee);const errorRows=rows.filter((row):row is Extract<FbrCalculatedRow,{success:false}>=>row.success===false);return{success:true,rows,totals,errors:errorRows.map(row=>row.error)};}

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: "ERPNext Online-First POS",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && (input.key === "F9" || input.code === "F9")) {
      event.preventDefault();
      mainWindow.webContents.send("pos:complete-sale-shortcut");
    }
  });
}

app.whenReady().then(() => {
  initDatabase();
  ipcMain.handle("db:getStatus", () => getDatabaseStatus());
  ipcMain.handle("settings:save", (_event, settings) => saveSettings(settings));
  ipcMain.handle("settings:load", () => getSettingsForRenderer());
  ipcMain.handle("server:test", () => testServerReachability());
  ipcMain.handle("auth:test", () => testApiAuthentication());
  ipcMain.handle("pos-profiles:list", () => loadAvailablePosProfiles());
  ipcMain.handle("pos-profile:load", () => loadPosProfile());
  ipcMain.handle("pos-profile-cache:get-status", () => getPosProfileCacheStatus());
  ipcMain.handle("pos-configuration:sync", () => syncPosConfiguration());
  ipcMain.handle("pos-configuration:get-cached", () => getCachedPosConfiguration());
  ipcMain.handle("pos-session:sync", () => getActivePosSession());
  ipcMain.handle("pos-session:get-cached", () => getCachedSessionSummary());
  ipcMain.handle("pos-session:active", () => getActivePosSession());
  ipcMain.handle("pos-session:start", (_event,input) => startPosSession(asRecord(input)??{}));
  ipcMain.handle("catalog:sync", (event) => syncItemCatalog((message) => event.sender.send("catalog:progress", message)));
  ipcMain.handle("catalog:get-totals", () => getCatalogTotals());
  ipcMain.handle("fbr:sync", () => syncFbrConfig());
  ipcMain.handle("fbr:state", () => getFbrSyncState());
  ipcMain.handle("catalog:search", (_event, query) => searchCatalog(String(query), textValue(asRecord(getPosBootstrap(loadSettings().posProfile)?.pos_profile), "warehouse")));
  ipcMain.handle("catalog:lookup", (_event, query) => lookupCatalog(String(query), textValue(asRecord(getPosBootstrap(loadSettings().posProfile)?.pos_profile), "warehouse")));
  ipcMain.handle("cart:load", () => { const id = getCartIdentity(); return loadCartState(id.terminalId, id.openingEntry); });
  ipcMain.handle("cart:save", (_event, lines) => { const id = getCartIdentity(); saveCartState(id.terminalId, id.openingEntry, Array.isArray(lines) ? lines : []); });
  ipcMain.handle("payments:methods", () => getPaymentMethods());
  ipcMain.handle("payments:load", () => { const id=getCartIdentity(); const cartKey=`${id.terminalId}::${id.openingEntry}`; return loadPaymentDraft(cartKey); });
  ipcMain.handle("payments:save", (_event, payments) => { const id=getCartIdentity(); savePaymentDraft(`${id.terminalId}::${id.openingEntry}`,Array.isArray(payments)?payments:[]); });
  ipcMain.handle("customers:sync", () => syncCustomers());
  ipcMain.handle("customers:state", () => getCustomerSyncState());
  ipcMain.handle("customers:search", (_event, query) => searchCustomers(String(query)));
  ipcMain.handle("customers:load", (_event, name) => loadCustomer(String(name)));
  ipcMain.handle("customers:options", () => getCustomerCreationOptions());
  ipcMain.handle("customers:create", (_event, input) => createCustomer(asRecord(input) ?? {}));
  ipcMain.handle("cart:preview", (_event, input) => previewCart(asRecord(input) ?? {}));
  ipcMain.handle("fbr:preview", (_event, input) => calculateFbrCart(asRecord(input) ?? {}));
  ipcMain.handle("benefits:load", () => { const id = getCartIdentity(); return loadBenefitsDraft(`${id.terminalId}::${id.openingEntry}`); });
  ipcMain.handle("benefits:save", (_event, benefits) => { const id = getCartIdentity(); const data = asRecord(benefits); if (data) saveBenefitsDraft(`${id.terminalId}::${id.openingEntry}`, data); });
  ipcMain.handle("benefits:customer", (_event, customerName) => getCustomerBenefits(String(customerName)));
  ipcMain.handle("benefits:validate-coupon", (_event, couponCode) => validateCoupon(String(couponCode)));
  ipcMain.handle("sale:terminal-id", () => getTerminalInvoiceId());
  ipcMain.handle("sale:submit", (_event,input) => submitOnlineSale(asRecord(input)??{}));
  ipcMain.handle("receipt:get", (_event,invoice) => getPosReceipt(String(invoice)));
  ipcMain.handle("receipt:get-duplicate", (_event, invoice) => getDuplicateReceipt(String(invoice)));
  ipcMain.handle("receipt:print", (_event, html) => printReceiptHtml(String(html ?? "")));
  ipcMain.handle("held:save", (_event, input) => holdSale(toHeldInput(asRecord(input) ?? {})));
  ipcMain.handle("held:list", () => listHeldSales());
  ipcMain.handle("held:get", (_event, id) => getHeldSale(Number(id)));
  ipcMain.handle("held:delete", (_event, id) => deleteHeldSale(Number(id)));
  ipcMain.handle("held:rename", (_event, id, name) => renameHeldSale(Number(id), String(name ?? "")));
  ipcMain.handle("history:list", (_event, filter) => listSalesHistory(toHistoryFilter(asRecord(filter) ?? {})));
  ipcMain.handle("history:get", (_event, id) => getSaleHistory(String(id)));
  ipcMain.handle("history:reprint", (_event, id) => recordReprint(String(id)));
  ipcMain.handle("sale:set-status", (_event, id, status) => setSaleHistoryStatus(String(id), String(status)));
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
