interface DatabaseStatus {
  isReady: boolean;
  path: string;
  schemaVersion: string | null;
}

interface PosAPI {
  getDatabaseStatus: () => Promise<DatabaseStatus>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  loadSettings: () => Promise<RendererSettings>;
  testServer: () => Promise<{ connected: boolean }>;
  testLogin: () => Promise<{ success: boolean; loggedUser: string | null }>;
  loadPosProfiles: () => Promise<{ success: boolean; profiles: PosProfileOption[]; error: string | null }>;
  loadPosProfile: () => Promise<{ success: boolean; profile: PosProfileDetails | null; error: string | null; syncedAt: string | null }>;
  getPosProfileCacheStatus: () => Promise<{ isReady: boolean; lastSynced: string | null }>;
  syncPosConfiguration: () => Promise<{ success: boolean; summary: PosConfigurationSummary | null; error: string | null }>;
  getCachedPosConfiguration: () => Promise<PosConfigurationSummary | null>;
  syncPosSession: () => Promise<{ success: boolean; summary: PosSessionSummary; error: string | null }>;
  getCachedPosSession: () => Promise<PosSessionSummary>;
  syncItemCatalog: () => Promise<{ success: boolean; totals: CatalogTotals; barcodeError: string | null; error: string | null }>;
  syncFbrConfig: () => Promise<{ success: boolean; state: { serviceFee: number }; error: string | null }>;
  getCatalogTotals: () => Promise<CatalogTotals>;
  searchCatalog: (query: string) => Promise<CatalogSearchResult[]>;
  onCatalogProgress: (callback: (message: string) => void) => void;
  lookupCatalog: (query: string) => Promise<{ exact: CatalogSearchResult | null; results: CatalogSearchResult[] }>;
  loadCart: () => Promise<{ cartKey: string; lines: CartLine[] }>;
  saveCart: (lines: CartLine[]) => Promise<void>;
  syncCustomers: () => Promise<{ success: boolean; state: {count:number;lastSynced:string|null}; error:string|null }>;
  getCustomerSyncState: () => Promise<{count:number;lastSynced:string|null}>;
  searchCustomers: (query:string) => Promise<CustomerResult[]>;
  loadCustomer: (name:string) => Promise<{customer: Record<string,unknown>|null;cached:boolean;error:string|null}>;
  getCustomerCreationOptions: () => Promise<{groups:string[];territories:string[];error:string|null}>;
  createCustomer: (input:Record<string,unknown>) => Promise<{customer:Record<string,unknown>|null;error:string|null}>;
  previewCart: (input:Record<string,unknown>) => Promise<{preview:Record<string,unknown>|null;error:string|null}>;
  previewFbr: (input:Record<string,unknown>) => Promise<Record<string,unknown>>;
  getPaymentMethods: () => Promise<string[]>;
  loadPaymentDraft: () => Promise<PaymentRow[]>;
  savePaymentDraft: (payments: PaymentRow[]) => Promise<void>;
  getTerminalInvoiceId: () => Promise<string>;
  submitSale: (input: Record<string,unknown>) => Promise<{success:boolean;response:Record<string,unknown>|null;error:string|null}>;
  onCompleteSaleShortcut: (callback: () => void) => void;
  getActivePosSession: () => Promise<{success:boolean;session:Record<string,unknown>|null;error:string|null;diagnosticReason:string;apiUser:string;requestedPosProfile:string;entries:Record<string,unknown>[]}>;
  startPosSession: (input: Record<string,unknown>) => Promise<{success:boolean;session:Record<string,unknown>|null;error:string|null}>;
  getCustomerBenefits: (customerName: string) => Promise<{ loyaltyProgram: string | null; availablePoints: number; conversionFactor: number; error: string | null }>;
  validateCoupon: (couponCode: string) => Promise<{ couponName: string | null; discountAmount: number; error: string | null }>;
  loadBenefitsDraft: () => Promise<AppliedBenefits | null>;
  saveBenefitsDraft: (benefits: AppliedBenefits) => Promise<void>;
  getReceipt: (posInvoice: string) => Promise<{ html: string | null; error: string | null }>;
  getDuplicateReceipt: (posInvoice: string) => Promise<{ html: string | null; error: string | null }>;
  printReceipt: (html: string) => Promise<{ success: boolean; error: string | null }>;
  holdSale: (input: Record<string, unknown>) => Promise<{ id: number; displayName: string }>;
  listHeldSales: () => Promise<HeldSaleSummary[]>;
  getHeldSale: (id: number) => Promise<HeldSaleDetail | null>;
  deleteHeldSale: (id: number) => Promise<void>;
  renameHeldSale: (id: number, name: string) => Promise<void>;
  listSalesHistory: (filter: Record<string, unknown>) => Promise<SalesHistoryRow[]>;
  getSaleHistory: (id: string) => Promise<SalesHistoryRow | null>;
  recordReprint: (id: string) => Promise<{ reprintCount: number; lastReprintedAt: string }>;
  setSaleStatus: (id: string, status: string) => Promise<void>;
}

interface HeldSaleSummary { id: number; terminalInvoiceId: string; displayName: string; customer: string; customerName: string; posProfile: string; openingEntry: string; itemCount: number; estimatedTotal: number; createdAt: string; updatedAt: string; status: string; }
interface HeldSaleDetail extends HeldSaleSummary { company: string; branch: string; cart: unknown[]; payments: unknown[]; benefits: Record<string, unknown> | null; totals: Record<string, unknown> | null; validationSnapshot: Record<string, unknown> | null; }
interface SalesHistoryRow { terminalInvoiceId: string; posInvoice: string | null; status: string; createdAt: string; submittedAt: string | null; reprintCount: number; lastReprintedAt: string | null; payload: Record<string, unknown> | null; response: Record<string, unknown> | null; }

interface AppliedBenefits {
  loyaltyPoints: number;
  couponCode: string;
  cartKey?: string;
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

interface CatalogTotals { items: number; prices: number; barcodes: number; stockRows: number; lastSynced: string | null; }
interface CatalogSearchResult { itemCode: string; itemName: string; barcode: string | null; uom: string; sellingPrice: number | null; currency: string | null; actualStock: number | null; warehouse: string | null; }
interface CartLine extends CatalogSearchResult { quantity: number; }
interface CustomerResult { name:string; customer_name:string; customer_group:string; mobile_no:string; email_id:string; tax_id:string; }
interface PaymentRow { method:string; amount:number; }

interface AppSettings {
  erpnextUrl: string;
  apiKey: string;
  apiSecret: string;
  terminalId: string;
  posProfile: string;
  branch: string;
  warehouse: string;
}

interface RendererSettings {
  erpnextUrl: string;
  apiKey: string;
  terminalId: string;
  posProfile: string;
  branch: string;
  warehouse: string;
  hasApiSecret: boolean;
}

interface Window {
  posAPI: PosAPI;
}

async function showDatabaseStatus(): Promise<void> {
  const statusElement = document.querySelector<HTMLElement>("#sqlite-status");
  const pathElement = document.querySelector<HTMLElement>("#database-path");

  if (!statusElement || !pathElement) {
    return;
  }

  try {
    const status = await window.posAPI.getDatabaseStatus();
    statusElement.textContent = status.isReady ? "Ready" : "Not Initialized";
    pathElement.textContent = status.path || "Database path unavailable";
    pathElement.title = status.path;
  } catch {
    statusElement.textContent = "Unavailable";
    pathElement.textContent = "Unable to read database status";
  }
}

function formatDateTime(isoDate: string | null): string {
  return isoDate ? new Date(isoDate).toLocaleString() : "Not synced";
}

function showPosProfileCacheStatus(isReady: boolean, lastSynced: string | null): void {
  const statusElement = document.querySelector<HTMLElement>("#profile-cache-status");
  const syncedElement = document.querySelector<HTMLElement>("#profile-cache-synced");
  if (statusElement) {
    statusElement.textContent = isReady ? "Ready" : "Not Ready";
  }
  if (syncedElement) {
    syncedElement.textContent = formatDateTime(lastSynced);
  }
}

async function loadPosProfileCacheStatus(): Promise<void> {
  try {
    const status = await window.posAPI.getPosProfileCacheStatus();
    showPosProfileCacheStatus(status.isReady, status.lastSynced);
  } catch {
    showPosProfileCacheStatus(false, null);
  }
}

function showPosConfigurationSummary(summary: PosConfigurationSummary | null): void {
  const section = document.querySelector<HTMLElement>("#pos-configuration-summary");
  if (!section) {
    return;
  }
  if (!summary) {
    section.hidden = true;
    return;
  }

  const fields: Record<string, string> = {
    "#config-pos-profile": summary.posProfile,
    "#config-company": summary.company,
    "#config-branch": summary.branch,
    "#config-warehouse": summary.warehouse,
    "#config-customer": summary.defaultCustomer,
    "#config-price-list": summary.sellingPriceList,
    "#config-currency": summary.currency,
    "#config-tax-template": summary.taxTemplate ?? "Not configured",
    "#config-tax-count": String(summary.taxRowsCount),
    "#config-payment-count": String(summary.paymentMethodsCount),
    "#config-last-synced": formatDateTime(summary.lastSynced),
    "#config-cache-status": summary.cacheStatus
  };

  for (const [selector, value] of Object.entries(fields)) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      element.textContent = value || "Not configured";
    }
  }
  section.hidden = false;
}

async function loadCachedPosConfiguration(): Promise<void> {
  try {
    showPosConfigurationSummary(await window.posAPI.getCachedPosConfiguration());
  } catch {
    showPosConfigurationSummary(null);
  }
}

function showPosSessionSummary(summary: PosSessionSummary): void {
  const fields: Record<string, string> = {
    "#session-status": summary.sessionStatus,
    "#session-opening-entry": summary.openingEntry || "No active POS Opening Entry",
    "#session-user": summary.user || "—",
    "#session-start": summary.startDateTime || "—",
    "#session-balance-count": String(summary.openingBalanceRowsCount),
    "#session-last-synced": formatDateTime(summary.lastSynced)
  };
  for (const [selector, value] of Object.entries(fields)) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      element.textContent = value;
    }
  }
}
function showSessionDiagnostics(result:{diagnosticReason:string;apiUser:string;requestedPosProfile:string;entries:Record<string,unknown>[]}):void{setCartText("#session-api-user",result.apiUser||"—");setCartText("#session-requested-profile",result.requestedPosProfile||"—");setCartText("#session-diagnostic-reason",result.diagnosticReason);setCartText("#session-entry-count",String(result.entries.length));const box=document.querySelector<HTMLElement>("#session-entry-list");if(box)box.replaceChildren(...result.entries.map(entry=>{const p=document.createElement("p");p.textContent=`${String(entry.name??"—")} | User: ${String(entry.user??"—")} | Profile: ${String(entry.pos_profile??"—")} | Status: ${String(entry.status??"—")} | Docstatus: ${String(entry.docstatus??"—")}`;return p;}));}

async function loadCachedPosSession(): Promise<void> {
  try {
    showPosSessionSummary(await window.posAPI.getCachedPosSession());
  } catch {
    showPosSessionSummary({ sessionStatus: "Not Open", openingEntry: "", user: "", startDateTime: "", openingBalanceRowsCount: 0, lastSynced: null });
  }
}

function showCatalogTotals(totals: CatalogTotals): void {
  const fields: Record<string, string> = { "#catalog-items": String(totals.items), "#catalog-prices": String(totals.prices), "#catalog-barcodes": String(totals.barcodes), "#catalog-stock": String(totals.stockRows), "#catalog-synced": formatDateTime(totals.lastSynced) };
  for (const [selector, value] of Object.entries(fields)) {
    const element = document.querySelector<HTMLElement>(selector); if (element) element.textContent = value;
  }
  const barcodeCount = document.querySelector<HTMLElement>("#barcode-count");
  if (barcodeCount) barcodeCount.textContent = `Barcode count: ${totals.barcodes}`;
  const barcodeStatus = document.querySelector<HTMLElement>("#barcode-sync-status");
  if (barcodeStatus && totals.lastSynced) barcodeStatus.textContent = "Barcode Sync: Ready";
}

function showCatalogProgress(message: string): void { const element = document.querySelector<HTMLElement>("#catalog-progress"); if (element) element.textContent = message; }

function showCatalogResults(results: CatalogSearchResult[]): void {
  const container = document.querySelector<HTMLElement>("#catalog-results");
  if (!container) return;
  container.replaceChildren();
  for (const result of results) {
    const row = document.createElement("div"); row.className = "catalog-result";
    row.textContent = `${result.itemCode} — ${result.itemName} | Barcode: ${result.barcode ?? "—"} | UOM: ${result.uom} | Price: ${result.sellingPrice ?? "—"} ${result.currency ?? ""} | Stock: ${result.actualStock ?? "—"} | Warehouse: ${result.warehouse ?? "—"}`;
    container.append(row);
  }
}

let cartLines: CartLine[] = [];
let selectedCartIndex = -1;
let cartSearchResults: CatalogSearchResult[] = [];
let selectedSearchIndex = 0;
let selectedCustomer: CustomerResult | null = null;
let customerResults: CustomerResult[] = [];
let selectedCustomerIndex = 0;
let cartPreviewTimer: number | undefined;
let serverTotals: Record<string, unknown> | null = null;
// --- Server-validation state (version-tracked) ---
let currentCartVersion = 0;        // bumped on every cart / customer / coupon / loyalty change
let validatedCartVersion = -1;     // highest cart version confirmed by the server preview
let paymentPreparedVersion = -1;   // cart version the prepared payment belongs to
let previewStatus: "idle" | "local" | "validating" | "validated" | "applied" | "error" = "idle";
let previewError = "";
let activePreviewPromise: Promise<void> | null = null;
let serverTaxRows: unknown[] | null = null;   // top-level tax rows returned by the server
let localFbrTotals: Record<string, unknown> | null = null;
// --- Receipt / submission state ---
let lastSaleResponse: Record<string, unknown> | null = null; // authoritative submission response, stored before any cart reset
let lastReceiptHtml: string | null = null;                   // server-rendered receipt HTML for printing
let receiptInvoice = "";                                     // POS Invoice name for (re)printing
let changeDue = 0;                                           // cash tendered above the bill, to be returned (never recorded as payment)
let resumedHeldId: number | null = null;                     // id of the held sale currently resumed (removed after successful submit)
let receiptMode: "sale" | "history" = "sale";                // sale = just submitted (close starts new sale); history = duplicate view
let paymentMethods: string[] = [];
let selectedPaymentMethodIndex = 0;
let paymentRows: PaymentRow[] = [];
let paymentsOutdated = false;
let prevServerConnected = false;
// --- POS session health ---
interface SessionState { openingEntry: string; status: string; user: string; posProfile: string; periodStart: string; lastChecked: number; valid: boolean; reason: string; }
let sessionState: SessionState = { openingEntry: "", status: "", user: "", posProfile: "", periodStart: "", lastChecked: 0, valid: false, reason: "Not checked" };
let authenticatedUser = "";
let sessionHasEntry = false;        // an opening entry was returned (even if invalid) — distinguishes "closed/mismatch" from "no shift"
let pendingSwitchEntry = "";        // a different active opening entry awaiting explicit confirmation to switch
let sessionCheckInFlight: Promise<boolean> | null = null;
let paymentEditIndex: number | null = null;
let terminalInvoiceId = "";
let submissionInProgress = false;
let appliedBenefits: AppliedBenefits = { loyaltyPoints: 0, couponCode: "" };
let customerBenefits = { loyaltyProgram: "", availablePoints: 0, conversionFactor: 1 };
let benefitsOutdated = false;
const slashSearchEnabled = true;
function cartInput(): HTMLInputElement | null { return document.querySelector<HTMLInputElement>("#cart-search"); }
function focusCart(): void { window.setTimeout(() => cartInput()?.focus(), 0); }
function cartMessage(message: string): void { const e = document.querySelector<HTMLElement>("#cart-message"); if (e) e.textContent = message; }
function clearCartSearch(): void { cartSearchResults = []; selectedSearchIndex = 0; const input = cartInput(); if (input) input.value = ""; document.querySelector<HTMLElement>("#cart-search-results")?.replaceChildren(); }
type PosScreen = "pos" | "settings" | "start-shift" | "held-sales" | "sales-history";
const screenIds: Record<PosScreen, string> = { pos: "#pos-screen", settings: "#settings-screen", "start-shift": "#start-shift-screen", "held-sales": "#held-sales-screen", "sales-history": "#sales-history-screen" };
// Switches the visible view without touching cart/customer/payment state.
function showScreen(screen: PosScreen): void {
  for (const [key, selector] of Object.entries(screenIds)) { const el = document.querySelector<HTMLElement>(selector); if (el) el.hidden = key !== screen; }
  if (screen === "pos") focusCart();
}
function updatePosHeader(): void { const set = (id: string, value: string) => { const e = document.querySelector<HTMLElement>(id); if (e) e.textContent = value || "—"; }; set("#pos-branch", (document.querySelector<HTMLInputElement>("#branch")?.value ?? "")); set("#pos-profile-name", document.querySelector<HTMLSelectElement>("#pos-profile")?.value ?? ""); set("#pos-terminal", document.querySelector<HTMLInputElement>("#terminal-id")?.value ?? ""); const user = document.querySelector<HTMLElement>("#session-user")?.textContent ?? ""; set("#pos-cashier", user); set("#pos-opening-entry", document.querySelector<HTMLElement>("#session-opening-entry")?.textContent ?? ""); }
function showCustomer(): void { const e=document.querySelector<HTMLElement>("#pos-customer"); if(e)e.textContent=selectedCustomer?`${selectedCustomer.customer_name || selectedCustomer.name}${navigator.onLine?"":" (Cached)"}`:"—"; }
function customerInput(): HTMLInputElement | null { return document.querySelector<HTMLInputElement>("#customer-search"); }
async function selectCustomer(customer: CustomerResult): Promise<void> { const result=await window.posAPI.loadCustomer(customer.name); selectedCustomer=customer; showCustomer(); // mark payment and benefits allocation outdated when customer changes
  if (paymentRows.length) paymentsOutdated = true;
  appliedBenefits={loyaltyPoints:0,couponCode:""}; benefitsOutdated=true;
  customerBenefits={loyaltyProgram:"",availablePoints:0,conversionFactor:1};
  void loadCustomerBenefits();
  scheduleCartPreview(); const data=result.customer; const detail=document.querySelector<HTMLElement>("#customer-detail"); if(detail)detail.textContent=data?`${String(data.customer_name??customer.customer_name)} | ${String(data.mobile_no??"")} | ${String(data.customer_group??"")} | ${String(data.loyalty_program??"")}${result.cached?" (Cached)":""}`:result.error??"Customer unavailable"; document.querySelector<HTMLDialogElement>("#customer-dialog")?.close(); focusCart(); }

async function searchCustomer(preserveSelection = false): Promise<void> { const query=customerInput()?.value.trim()??""; customerResults=await window.posAPI.searchCustomers(query); if(!preserveSelection) selectedCustomerIndex=0; selectedCustomerIndex=Math.min(selectedCustomerIndex,Math.max(0,customerResults.length-1)); const box=document.querySelector<HTMLElement>("#customer-results"); if(!box)return; box.replaceChildren(...customerResults.map((c,i)=>{const b=document.createElement("button");b.type="button";b.className=`secondary-button search-result${i===selectedCustomerIndex?" selected":""}`;b.textContent=`${c.name} — ${c.customer_name} | ${c.mobile_no||c.email_id||c.tax_id||""}`;b.onclick=()=>void selectCustomer(c);return b;})); box.querySelector<HTMLElement>(".selected")?.scrollIntoView({block:"nearest"}); }
function openCustomerSearch(): void { const dialog=document.querySelector<HTMLDialogElement>("#customer-dialog"); if(!dialog)return; dialog.showModal(); const createButton=document.querySelector<HTMLButtonElement>("#new-customer"); if(createButton)createButton.disabled=!isOnline(); const detail=document.querySelector<HTMLElement>("#customer-detail"); if(detail)detail.textContent=isOnline()?"":"Online connection required to create a customer."; const input=customerInput(); if(input){input.value="";input.focus();} void searchCustomer(); }
function isOnline(): boolean { return document.querySelector<HTMLElement>("#pos-server-status")?.textContent === "Online"; }
async function showStartShift():Promise<void>{const set=(id:string,value:string)=>{const e=document.querySelector<HTMLElement>(id);if(e)e.textContent=value||"—";};set("#shift-profile",document.querySelector<HTMLSelectElement>("#pos-profile")?.value??"");set("#shift-terminal",document.querySelector<HTMLInputElement>("#terminal-id")?.value??"");set("#shift-company",document.querySelector<HTMLElement>("#config-company")?.textContent??"");set("#shift-cashier",document.querySelector<HTMLElement>("#pos-cashier")?.textContent??"");const modes=await window.posAPI.getPaymentMethods();const box=document.querySelector<HTMLElement>("#shift-opening-amounts");const message=document.querySelector<HTMLElement>("#start-shift-message");if(!modes.length){if(message)message.textContent="No payment methods loaded from POS Profile";if(box)box.replaceChildren();showScreen("start-shift");return;}if(message)message.textContent="";if(box)box.replaceChildren(...modes.map((mode)=>{const label=document.createElement("label");label.textContent=`${mode} Opening Amount`;const input=document.createElement("input");input.type="number";input.step="0.001";input.dataset.mode=mode;input.value="0";label.append(input);return label;}));showScreen("start-shift");}
async function startShift():Promise<void>{const message=document.querySelector<HTMLElement>("#start-shift-message");if(!isOnline()){if(message)message.textContent="Online connection required to start shift";return;}const balances=[...document.querySelectorAll<HTMLInputElement>("#shift-opening-amounts input")].map(input=>({mode_of_payment:input.dataset.mode??"",opening_amount:Number(input.value)||0})).filter(row=>Boolean(row.mode_of_payment));if(!balances.length){if(message)message.textContent="No payment methods loaded from POS Profile";return;}if(message)message.textContent=`Development diagnostics — opening balances: ${balances.map(row=>`${row.mode_of_payment}=${row.opening_amount}`).join(", ")}`;const result=await window.posAPI.startPosSession({opening_balances:balances});if(!result.success||!result.session){if(message)message.textContent=result.error??"Unable to start shift";return;}const s=result.session;showPosSessionSummary({sessionStatus:"Open",openingEntry:String(s.opening_entry??s.name??""),user:String(s.user??""),startDateTime:String(s.period_start_date??s.creation??""),openingBalanceRowsCount:Array.isArray(s.balance_details)?s.balance_details.length:0,lastSynced:new Date().toISOString()});
  // Server cached the Opening Entry; re-run validation against it, then open POS.
  sessionState.openingEntry="";const ok=await validateSession("start-shift");updatePosHeader();
  if(ok){showScreen("pos");}else{if(message)message.textContent=sessionState.reason||"Session could not be validated after starting the shift.";}}
async function openNewCustomer(): Promise<void> { const error=document.querySelector<HTMLElement>("#customer-detail"); if(!isOnline()){if(error)error.textContent="Online connection required to create a customer.";return;} const options=await window.posAPI.getCustomerCreationOptions(); if(options.error){if(error)error.textContent=options.error;return;} const fill=(id:string,values:string[])=>{const select=document.querySelector<HTMLSelectElement>(id);if(select)select.replaceChildren(...values.map(v=>new Option(v,v)));}; fill("#new-customer-group",options.groups);fill("#new-customer-territory",options.territories);document.querySelector<HTMLDialogElement>("#new-customer-dialog")?.showModal();document.querySelector<HTMLInputElement>("#new-customer-name")?.focus(); }
async function persistCart(): Promise<void> { await window.posAPI.saveCart(cartLines); }
function previewNumber(data: Record<string, unknown> | null, ...keys: string[]): number | null { for(const key of keys){const value=data?.[key];if(typeof value==="number")return value;if(typeof value==="string"&&!Number.isNaN(Number(value)))return Number(value);}return null; }
function setCartText(id:string,value:string):void{const e=document.querySelector<HTMLElement>(id);if(e)e.textContent=value;}
function asTotalsRecord(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }

const FBR_TOTAL_KEYS = ["merchandise_total", "value_excluding_tax", "total_sales_tax", "fbr_pos_service_fee", "grand_total", "rounded_total"] as const;

// Unwrap a Frappe-style preview envelope: response.message, response.message.message, or an already-normalized object.
function normalizePreviewResponse(response: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!response) return null;
  const inner = asTotalsRecord(response.message);
  if (inner) { const deep = asTotalsRecord(inner.message); return deep ?? inner; }
  return response;
}

// Map the local FBR engine result (camelCase totals) onto the snake_case keys used for display + comparison.
function normalizeLocalFbrTotals(local: Record<string, unknown> | null): Record<string, unknown> | null {
  const totals = asTotalsRecord(local?.totals);
  if (!totals) return null;
  const merchandise = previewNumber(totals, "merchandiseTotal") ?? 0;
  const valueExcludingTax = previewNumber(totals, "totalValueExcludingTax") ?? 0;
  const salesTax = previewNumber(totals, "totalSalesTax") ?? 0;
  const serviceFee = previewNumber(totals, "serviceFee") ?? 0;
  const payable = previewNumber(totals, "customerPayable") ?? (merchandise + serviceFee);
  return {
    merchandise_total: merchandise,
    value_excluding_tax: valueExcludingTax,
    total_sales_tax: salesTax,
    fbr_pos_service_fee: serviceFee,
    grand_total: payable,
    rounded_total: payable,
    // Backward-compatible keys consumed by renderCart() / payableAmount().
    subtotal: merchandise,
    net_total: valueExcludingTax,
    total_taxes_and_charges: salesTax,
    payable_after_loyalty: payable
  };
}

function extractFbrTotals(src: Record<string, unknown> | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of FBR_TOTAL_KEYS) { const value = previewNumber(src, key); if (value !== null) out[key] = value; }
  return out;
}

// Compare only on totals the server actually returned, so a partial payload never forces a false mismatch.
function fbrTotalsDiffer(local: Record<string, unknown> | null, server: Record<string, unknown> | null): boolean {
  const localTotals = extractFbrTotals(local);
  const serverTotalsValues = extractFbrTotals(server);
  for (const key of FBR_TOTAL_KEYS) {
    if (key in serverTotalsValues && Math.abs(serverTotalsValues[key] - (localTotals[key] ?? 0)) > 0.001) return true;
  }
  return false;
}

function showPreviewStatus(text: string): void { setCartText("#cart-validation", text); }

function renderServerTaxRows(): void {
  const container = document.querySelector<HTMLElement>("#cart-tax-breakdown");
  if (!container) return;
  const rows = Array.isArray(serverTaxRows) ? serverTaxRows : [];
  container.replaceChildren(...rows.map((row) => {
    const record = asTotalsRecord(row);
    const description = String(record?.description ?? record?.account_head ?? "Tax");
    const amount = previewNumber(record, "tax_amount", "amount", "total") ?? 0;
    const line = document.createElement("div");
    line.className = "cart-tax-row";
    line.textContent = `${description}: ${amount.toFixed(2)}`;
    return line;
  }));
}

// Upgraded in place: keeps local FBR totals immediate, debounces + ignores stale server validation,
// then reconciles against the server. All existing callers keep the same zero-argument signature.
function scheduleCartPreview(): void {
  const version = ++currentCartVersion;
  // Any cart / customer / coupon / loyalty change invalidates a previously prepared payment.
  if (paymentRows.length) paymentsOutdated = true;

  if (!cartLines.length) {
    serverTotals = null; localFbrTotals = null; serverTaxRows = null;
    previewStatus = "idle"; previewError = "";
    validatedCartVersion = version; // an empty cart needs no server validation
    activePreviewPromise = null;
    setCartText("#cart-calculating", "");
    showPreviewStatus("");
    renderServerTaxRows();
    renderCart();
    return;
  }

  activePreviewPromise = runCartPreview(version);
}

async function runCartPreview(version: number): Promise<void> {
  // 1) Local FBR totals — computed via secure IPC and shown immediately, before any debounce.
  setCartText("#cart-calculating", "");
  previewStatus = "local"; previewError = "";
  try {
    const local = await window.posAPI.previewFbr({
      items: cartLines.map((line) => ({ item_code: line.itemCode, uom: line.uom, qty: line.quantity, rate: line.sellingPrice ?? 0 }))
    });
    if (version !== currentCartVersion) return; // a newer change superseded us
    const normalized = normalizeLocalFbrTotals(local);
    if (normalized) { localFbrTotals = normalized; serverTotals = { ...normalized }; }
  } catch { /* local FBR unavailable — fall through to server validation, keeping prior totals */ }
  previewStatus = "validating";
  showPreviewStatus("Validating…");
  renderCart();

  // 2) Debounce the server round-trip; older versions no-op via the stale guard below.
  await new Promise<void>((resolve) => { cartPreviewTimer = window.setTimeout(resolve, 350); });
  if (version !== currentCartVersion) return;

  // 3) Validate the exact cart / customer / coupon / loyalty state with the server.
  const previewInput: Record<string, unknown> = {
    customer: selectedCustomer?.name ?? "",
    items: cartLines.map((line) => ({ item_code: line.itemCode, uom: line.uom, qty: line.quantity }))
  };
  if (appliedBenefits.loyaltyPoints > 0) { previewInput.redeem_loyalty_points = appliedBenefits.loyaltyPoints; previewInput.loyalty_points = appliedBenefits.loyaltyPoints; }
  if (appliedBenefits.couponCode) previewInput.coupon_code = appliedBenefits.couponCode;

  const result = await window.posAPI.previewCart(previewInput);
  if (version !== currentCartVersion) return; // ignore stale responses

  setCartText("#cart-calculating", "");
  if (!result.preview) {
    // Failure: retain the local FBR totals and surface the actual error.
    previewStatus = "error";
    previewError = result.error ?? "Offline Estimate — Not Server Validated";
    showPreviewStatus(previewError);
    renderCart();
    return;
  }

  const preview: Record<string, unknown> = normalizePreviewResponse(result.preview) ?? result.preview;
  const differs = fbrTotalsDiffer(localFbrTotals, preview);

  // Apply server item FBR values (per-line price/rate).
  const items = Array.isArray(preview.items) ? preview.items : [];
  for (const item of items) {
    const row = asTotalsRecord(item);
    if (!row) continue;
    const code = String(row.item_code ?? "");
    const uom = String(row.uom ?? "");
    const line = cartLines.find((x) => x.itemCode === code && (!uom || x.uom === uom));
    const rate = previewNumber(row, "rate", "price_list_rate");
    if (line && rate !== null) line.sellingPrice = rate;
  }

  // Apply server totals — keep the server's own fields and supplement the display keys from the FBR totals.
  const merged: Record<string, unknown> = { ...preview };
  const serverFbr = extractFbrTotals(preview);
  if ("merchandise_total" in serverFbr && merged.subtotal === undefined) merged.subtotal = serverFbr.merchandise_total;
  if ("value_excluding_tax" in serverFbr && merged.net_total === undefined) merged.net_total = serverFbr.value_excluding_tax;
  if ("total_sales_tax" in serverFbr && merged.total_taxes_and_charges === undefined) merged.total_taxes_and_charges = serverFbr.total_sales_tax;
  serverTotals = merged;

  // Store top-level server tax rows.
  serverTaxRows = Array.isArray(preview.taxes) ? preview.taxes as unknown[]
    : Array.isArray(preview.tax_rows) ? preview.tax_rows as unknown[]
    : Array.isArray(preview.fbr_taxes) ? preview.fbr_taxes as unknown[]
    : null;

  const availFromPreview = previewNumber(preview, "available_loyalty_points");
  if (availFromPreview !== null) customerBenefits.availablePoints = availFromPreview;

  validatedCartVersion = version;
  previewStatus = differs ? "applied" : "validated";
  showPreviewStatus(differs ? "Server Values Applied" : "Server Validated");
  renderServerTaxRows();
  renderCart();
}
function money2(value: number): number { return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100; }

// Single source of truth for the displayed totals. Uses authoritative server values when validated,
// local FBR values otherwise. Grand total always includes the FBR POS service fee.
// Sum the server tax rows whose description matches a pattern (e.g. the FBR sales-tax or POS service-fee rows).
function taxRowAmount(pattern: RegExp): number | null {
  if (!Array.isArray(serverTaxRows)) return null;
  let sum = 0; let found = false;
  for (const row of serverTaxRows) {
    const record = asTotalsRecord(row); if (!record) continue;
    const description = String(record.description ?? record.account_head ?? "").toLowerCase();
    if (pattern.test(description)) { const amount = previewNumber(record, "tax_amount", "amount", "total"); if (amount !== null) { sum += amount; found = true; } }
  }
  return found ? money2(sum) : null;
}

interface FbrTotalsView { merchandise: number; saleBeforeTax: number; salesTax: number; serviceFee: number; loyaltyAmount: number; grandTotal: number; payable: number; }
function fbrTotalsView(): FbrTotalsView {
  const linesSum = money2(cartLines.reduce((sum, line) => sum + (line.sellingPrice ?? 0) * line.quantity, 0));
  // Goods are tax-inclusive: trust the line-total sum / local FBR engine — the preview's doc totals come back as 0.
  const localMerch = previewNumber(localFbrTotals, "merchandise_total");
  const merchandise = (localMerch !== null && localMerch > 0) ? localMerch : linesSum;
  // Tax / fee come from the authoritative server tax rows first, then the local FBR engine.
  const salesTax = taxRowAmount(/sales tax|gst/i) ?? previewNumber(localFbrTotals, "total_sales_tax") ?? 0;
  const serviceFee = taxRowAmount(/service fee|pos fee/i) ?? previewNumber(localFbrTotals, "fbr_pos_service_fee") ?? 0;
  const saleBeforeTax = previewNumber(localFbrTotals, "value_excluding_tax") ?? money2(merchandise - salesTax);
  const loyaltyAmount = previewNumber(serverTotals, "loyalty_amount", "loyalty_points_redeemed", "loyaltyAmount") ?? 0;
  const grandTotal = money2(merchandise + serviceFee); // FBR POS service fee is added on top of the tax-inclusive goods total
  const payable = Math.max(0, money2(grandTotal - loyaltyAmount));
  return { merchandise, saleBeforeTax, salesTax, serviceFee, loyaltyAmount, grandTotal, payable };
}
function payableAmount():number{ return fbrTotalsView().payable; }
async function persistPayments():Promise<void>{await window.posAPI.savePaymentDraft(paymentRows);}
function paidAmount():number{return paymentRows.reduce((s,x)=>s+x.amount,0);}
function remainingAmount():number{return Math.max(0,money2(payableAmount()-paidAmount()));}
// Lightweight refresh of the Payable / Tendered / Paid / Remaining / Change figures (no row rebuild).
function refreshPaymentSummary():void{const input=document.querySelector<HTMLInputElement>("#payment-amount");const tendered=Number(input?.value)||0;const payable=payableAmount(),paid=paidAmount(),remaining=Math.max(0,money2(payable-paid));setCartText("#payment-payable",payable.toFixed(2));setCartText("#payment-tendered",tendered.toFixed(2));setCartText("#payment-allocated",paid.toFixed(2));setCartText("#payment-remaining",remaining.toFixed(2));setCartText("#payment-change",changeDue.toFixed(2));}
function renderPayments():void{refreshPaymentSummary();const box=document.querySelector<HTMLElement>("#payment-rows");if(box){box.replaceChildren(); for(const [i,row] of paymentRows.entries()){const container=document.createElement("div");container.className="payment-row";const text=document.createElement("span");text.textContent=`${row.method}: ${row.amount.toFixed(2)}`;const edit=document.createElement("button");edit.type="button";edit.className="secondary-button";edit.textContent="Edit";edit.onclick=()=>{paymentEditIndex=i; const methodIndex=paymentMethods.findIndex(m=>m.toLowerCase()===row.method.toLowerCase()); if(methodIndex>=0)selectedPaymentMethodIndex=methodIndex; renderPaymentMethods(); const input=document.querySelector<HTMLInputElement>("#payment-amount"); if(input){input.value=String(row.amount); input.focus(); input.select();}};const remove=document.createElement("button");remove.type="button";remove.className="secondary-button";remove.textContent="Remove";remove.onclick=async()=>{paymentRows.splice(i,1);changeDue=0;await persistPayments();renderPayments();};container.append(text,edit,remove);box.append(container);} } }

async function addPayment():Promise<void>{
  const input=document.querySelector<HTMLInputElement>("#payment-amount");
  const msg=document.querySelector<HTMLElement>("#payment-message");
  const entered=Number(input?.value);
  const method=paymentMethods[selectedPaymentMethodIndex]??"";
  const isCash=method.toLowerCase()==="cash";
  if(!Number.isFinite(entered)||entered<=0){if(msg)msg.textContent="Enter a valid amount.";input?.focus();return;}
  // Remaining owed, excluding the row this entry will replace (edited row, or an existing same-method row).
  const targetIndex=paymentEditIndex!==null?paymentEditIndex:paymentRows.findIndex(row=>row.method.toLowerCase()===method.toLowerCase());
  const allocatedOthers=paymentRows.reduce((sum,row,i)=> i===targetIndex ? sum : sum+row.amount, 0);
  const remaining=Math.max(0,money2(payableAmount()-allocatedOthers));
  // No advance / extra payment: only cash may be tendered above the bill, and the excess is returned as change — not recorded.
  if(!isCash && entered>remaining+0.0001){if(msg)msg.textContent="Amount exceeds the bill. No advance or extra payment allowed.";input?.focus();return;}
  const applied=isCash?Math.min(entered,remaining):entered;
  changeDue=isCash?money2(entered-applied):0;
  if(targetIndex>=0)paymentRows[targetIndex]={method,amount:applied};else paymentRows.push({method,amount:applied});
  paymentEditIndex=null;
  await persistPayments();renderPayments();if(input)input.value="";refreshPaymentSummary();
  if(remainingAmount()<=0.0001){await finalizePaymentReady();return;}
  if(msg)msg.textContent="";if(input)input.focus();}

// "Exact Amount" immediately adds whatever is still owed.
async function addExactAmount():Promise<void>{const input=document.querySelector<HTMLInputElement>("#payment-amount");if(input)input.value=remainingAmount().toFixed(2);await addPayment();}

// F6 / Complete Payment: settle any typed amount, then prepare the payment when fully covered.
async function completePaymentAllocation():Promise<void>{const input=document.querySelector<HTMLInputElement>("#payment-amount");if(input?.value.trim()){await addPayment();return;}if(remainingAmount()>0.0001){const msg=document.querySelector<HTMLElement>("#payment-message");if(msg)msg.textContent="Remaining amount must be zero.";return;}await finalizePaymentReady();}

// Mark the prepared payment for this exact cart version, then hand off to Complete Sale & Print.
async function finalizePaymentReady():Promise<void>{
  await persistPayments();
  paymentsOutdated=false;
  paymentPreparedVersion=currentCartVersion;
  renderPayments();
  renderCart(); // reflect Paid / Change on the totals panel
  const msg=document.querySelector<HTMLElement>("#payment-message");
  if(msg)msg.textContent="Payment Ready";
  updateCompleteSaleState();
  document.querySelector<HTMLDialogElement>("#payment-dialog")?.close();
  window.setTimeout(()=>document.querySelector<HTMLButtonElement>("#complete-sale")?.focus(),0);
}

function closePaymentDialog():void{ document.querySelector<HTMLDialogElement>('#payment-dialog')?.close(); focusCart(); }
// Single source of truth for why the sale cannot be completed (null === ready).
function blockedSaleReason():string|null{
  const opening=document.querySelector<HTMLElement>("#session-opening-entry")?.textContent??"";
  const terminal=document.querySelector<HTMLInputElement>("#terminal-id")?.value??"";
  const profile=document.querySelector<HTMLSelectElement>("#pos-profile")?.value??"";
  return !isOnline()?"Server is offline"
    :!sessionState.valid?(sessionState.reason||"POS session is no longer active")
    :(!opening||opening==="No active POS Opening Entry")?"No active POS Opening Entry"
    :!cartLines.length?"Cart is empty"
    :validatedCartVersion!==currentCartVersion?(previewError?`Cart not validated — ${previewError}`:"Validating cart…")
    :remainingAmount()>0.0001?"Payment is incomplete"
    :paymentPreparedVersion!==currentCartVersion?"Payment not prepared for current cart"
    :paymentsOutdated?"Payment draft is outdated"
    :!terminal?"Missing Terminal ID"
    :!profile?"Missing POS Profile"
    :!selectedCustomer?"Missing Customer"
    :null;
}

// Keep the fixed Complete Sale & Print button and its blocked-reason caption in sync with state.
function updateCompleteSaleState():void{
  const button=document.querySelector<HTMLButtonElement>("#complete-sale");
  const reasonEl=document.querySelector<HTMLElement>("#complete-sale-reason");
  if(submissionInProgress){if(button)button.disabled=true;if(reasonEl){reasonEl.textContent="Submitting Sale…";reasonEl.classList.remove("ready");}return;}
  const reason=blockedSaleReason();
  if(button)button.disabled=reason!==null;
  if(reasonEl){reasonEl.textContent=reason??"Ready — press F9 to complete";reasonEl.classList.toggle("ready",reason===null);}
}

async function submitCurrentSale():Promise<void>{
  if(submissionInProgress)return;
  if(document.querySelector<HTMLDialogElement>("#receipt-dialog")?.open)return; // already submitted; awaiting receipt close
  // F9 gate: confirm the POS session is still active immediately before submitting.
  if(!(await validateSession("submit"))){showSessionInvalid(sessionState.reason);cartMessage(sessionState.reason);return;}
  const reason=blockedSaleReason();
  if(reason){cartMessage(reason);updateCompleteSaleState();return;}
  const terminal=document.querySelector<HTMLInputElement>("#terminal-id")?.value??"";
  const profile=document.querySelector<HTMLSelectElement>("#pos-profile")?.value??"";
  const opening=document.querySelector<HTMLElement>("#session-opening-entry")?.textContent??"";
  const customer=selectedCustomer!;
  if(!terminalInvoiceId)terminalInvoiceId=await window.posAPI.getTerminalInvoiceId();
  submissionInProgress=true;cartMessage("Submitting Sale…");updateCompleteSaleState();
  // Submission payload unchanged; terminal_invoice_id is preserved across retries (only regenerated after Close & Start New Sale).
  const result=await window.posAPI.submitSale({terminal_invoice_id:terminalInvoiceId,terminal_id:terminal,pos_profile:profile,opening_entry:opening,customer:customer.name,items:cartLines.map(x=>({item_code:x.itemCode,qty:x.quantity,uom:x.uom,barcode:x.barcode??undefined})),payments:paymentRows.map(x=>({mode_of_payment:x.method,amount:x.amount})),coupon_code:appliedBenefits.couponCode,redeem_loyalty_points:appliedBenefits.loyaltyPoints>0,loyalty_points:appliedBenefits.loyaltyPoints});
  submissionInProgress=false;
  if(!result.success||!result.response?.pos_invoice){cartMessage(`Submission Failed: ${result.error??"Missing POS Invoice"}`);updateCompleteSaleState();return;}
  // Success: store authoritative response first, keep the cart, then open the receipt preview.
  lastSaleResponse=result.response;
  // Only after a confirmed successful submission: remove the resumed held draft so it can't be resumed again.
  if(resumedHeldId!==null){try{await window.posAPI.deleteHeldSale(resumedHeldId);}catch{/* non-fatal: held draft cleanup */}resumedHeldId=null;}
  cartMessage("Sale Submitted");
  updateCompleteSaleState();
  await openReceiptPreview(result.response);
}

// --- FBR status interpretation ---
function isValidFbrValue(value:unknown):boolean{const s=String(value??"").trim().toLowerCase();return s!==""&&!["not available","n/a","na","null","none","undefined","-"].includes(s);}
function pickString(record:Record<string,unknown>,keys:string[]):string{for(const key of keys){if(key in record){const value=record[key];if(value!==null&&value!==undefined&&String(value).trim()!=="")return String(value).trim();}}return "";}
function interpretFbr(response:Record<string,unknown>):{accepted:boolean;statusText:string;invoiceNumber:string;qr:string}{
  const nested=asTotalsRecord(response.fbr)??asTotalsRecord(response.fbr_response)??asTotalsRecord(response.fbr_invoice)??{};
  const src:Record<string,unknown>={...nested,...response};
  const invoiceRaw=pickString(src,["fbr_invoice_number","fbr_invoice_no","custom_fbr_invoice_number","fbrinvoicenumber","fbr_inv_num","fbr_ref_no","invoice_number"]);
  const invoiceNumber=isValidFbrValue(invoiceRaw)?invoiceRaw:"";
  const code=pickString(src,["fbr_response_code","response_code","fbr_code","fbr_status_code"]);
  const statusRaw=pickString(src,["fbr_status","fbr_validation_status","fbr_message","status"]);
  const statusLower=statusRaw.toLowerCase();
  // HTTP 200 alone is NOT acceptance: require a real FBR invoice number AND an explicit FBR success signal.
  const codeOk=["100","000","00","0"].includes(code)||/success|approved|valid|accept/.test(statusLower);
  const accepted=Boolean(invoiceNumber)&&codeOk;
  const qr=pickString(src,["fbr_qr","fbr_qr_code","qr_code","qr_data","qr"]);
  const statusText=accepted?"Accepted":(statusRaw||(invoiceNumber?"Pending":"Not Accepted"));
  return {accepted,statusText,invoiceNumber,qr};
}

async function openReceiptPreview(response:Record<string,unknown>):Promise<void>{
  receiptMode="sale";
  setCartText("#receipt-title","Receipt Preview");
  document.querySelector<HTMLButtonElement>("#receipt-print")?.removeAttribute("hidden");
  const dupBtn=document.querySelector<HTMLButtonElement>("#receipt-duplicate"); if(dupBtn)dupBtn.hidden=true;
  const closeBtn=document.querySelector<HTMLButtonElement>("#receipt-close"); if(closeBtn)closeBtn.textContent="Close and Start New Sale";
  const totals=fbrTotalsView();
  const posInvoice=String(response.pos_invoice??response.name??"");
  receiptInvoice=posInvoice;
  setCartText("#receipt-invoice",posInvoice||"—");
  setCartText("#receipt-posting",pickString(response,["posting_datetime","posting_date","creation"])||new Date().toLocaleString());
  setCartText("#receipt-cashier",document.querySelector<HTMLElement>("#pos-cashier")?.textContent??"—");
  setCartText("#receipt-customer",selectedCustomer?(selectedCustomer.customer_name||selectedCustomer.name):"—");
  const itemsBox=document.querySelector<HTMLElement>("#receipt-items");
  if(itemsBox)itemsBox.replaceChildren(...cartLines.map(line=>{const row=document.createElement("div");row.className="receipt-item";const amount=(line.sellingPrice??0)*line.quantity;[`${line.itemCode} — ${line.itemName}`,String(line.quantity),(line.sellingPrice??0).toFixed(2),amount.toFixed(2)].forEach(text=>{const span=document.createElement("span");span.textContent=text;row.append(span);});return row;}));
  setCartText("#receipt-before-tax",totals.saleBeforeTax.toFixed(2));
  setCartText("#receipt-sales-tax",totals.salesTax.toFixed(2));
  setCartText("#receipt-service-fee",totals.serviceFee.toFixed(2));
  setCartText("#receipt-grand-total",totals.payable.toFixed(2));
  const payBox=document.querySelector<HTMLElement>("#receipt-payments");
  if(payBox)payBox.replaceChildren(...paymentRows.map(row=>{const p=document.createElement("p");const label=document.createElement("span");label.textContent=row.method;const value=document.createElement("strong");value.textContent=row.amount.toFixed(2);p.append(label,value);return p;}));
  setCartText("#receipt-change",changeDue.toFixed(2));
  const fbr=interpretFbr(response);
  setCartText("#receipt-fbr-status",fbr.statusText);
  setCartText("#receipt-fbr-number",fbr.invoiceNumber||"—");
  const badge=document.querySelector<HTMLElement>("#receipt-fbr-badge");
  if(badge){badge.textContent=fbr.accepted?"FBR Accepted":fbr.statusText;badge.className=`fbr-badge ${fbr.accepted?"ok":"warn"}`;}
  const qrBox=document.querySelector<HTMLElement>("#receipt-qr");
  if(qrBox){qrBox.replaceChildren();if(fbr.qr){if(fbr.qr.startsWith("data:image")){const img=document.createElement("img");img.src=fbr.qr;img.alt="FBR QR";img.className="receipt-qr-img";qrBox.append(img);}else{const code=document.createElement("code");code.textContent=fbr.qr;qrBox.append(code);}}}
  const printBtn=document.querySelector<HTMLButtonElement>("#receipt-print");
  const reprintBtn=document.querySelector<HTMLButtonElement>("#receipt-reprint");
  if(printBtn)printBtn.disabled=true;if(reprintBtn)reprintBtn.hidden=true;lastReceiptHtml=null;
  // Start on the structured fallback; the rendered receipt iframe replaces it once retrieval succeeds.
  const frame=document.querySelector<HTMLIFrameElement>("#receipt-frame");if(frame){frame.removeAttribute("srcdoc");frame.hidden=true;}
  const structured=document.querySelector<HTMLElement>("#receipt-structured");if(structured)structured.hidden=false;
  document.querySelector<HTMLDialogElement>("#receipt-dialog")?.showModal();
  await retrieveReceipt(posInvoice);
}

// Pull the server-rendered receipt for printing. Failure never resubmits — the sale is already in Sales History.
async function retrieveReceipt(posInvoice:string):Promise<void>{
  const msg=document.querySelector<HTMLElement>("#receipt-message");
  const printBtn=document.querySelector<HTMLButtonElement>("#receipt-print");
  const reprintBtn=document.querySelector<HTMLButtonElement>("#receipt-reprint");
  if(!posInvoice){if(msg)msg.textContent="No POS Invoice to retrieve.";return;}
  const frame=document.querySelector<HTMLIFrameElement>("#receipt-frame");
  const structured=document.querySelector<HTMLElement>("#receipt-structured");
  if(msg)msg.textContent="Retrieving receipt…";
  try{
    const result=await window.posAPI.getReceipt(posInvoice);
    if(result.html){
      lastReceiptHtml=result.html;
      if(frame){frame.srcdoc=result.html;frame.hidden=false;}      // show the authoritative rendered receipt
      if(structured)structured.hidden=true;
      if(printBtn)printBtn.disabled=false;if(reprintBtn)reprintBtn.hidden=true;
      if(msg)msg.textContent="Receipt ready to print.";
    }else{
      lastReceiptHtml=null;
      if(frame){frame.removeAttribute("srcdoc");frame.hidden=true;}
      if(structured)structured.hidden=false;                        // fall back to the structured summary
      if(printBtn)printBtn.disabled=true;if(reprintBtn)reprintBtn.hidden=false;
      if(msg)msg.textContent=`Receipt retrieval failed: ${result.error??"Unknown error"}. Sale is saved in Sales History.`;
    }
  }catch(error){
    lastReceiptHtml=null;
    if(frame){frame.removeAttribute("srcdoc");frame.hidden=true;}
    if(structured)structured.hidden=false;
    if(printBtn)printBtn.disabled=true;if(reprintBtn)reprintBtn.hidden=false;
    if(msg)msg.textContent=`Receipt retrieval failed: ${error instanceof Error?error.message:"Unknown error"}. Sale is saved in Sales History.`;
  }
}

// The ONLY place the cart, payments and benefits are cleared and a new terminal_invoice_id is generated.
async function printReceiptNow():Promise<void>{
  const msg=document.querySelector<HTMLElement>("#receipt-message");
  if(!lastReceiptHtml){if(msg)msg.textContent="No receipt available. Use Reprint Receipt.";return;}
  const result=await window.posAPI.printReceipt(lastReceiptHtml);
  if(msg)msg.textContent=result.success?"Sent to printer.":`Print failed: ${result.error??"Unknown error"}`;
}

// Clears the active sale UI/state and issues a fresh terminal_invoice_id for the next sale.
async function clearActiveSale(message:string):Promise<void>{
  cartLines=[];selectedCartIndex=-1;paymentRows=[];appliedBenefits={loyaltyPoints:0,couponCode:""};changeDue=0;
  await persistCart();await persistPayments();await saveBenefitsDraft();
  serverTotals=null;localFbrTotals=null;serverTaxRows=null;
  validatedCartVersion=-1;paymentPreparedVersion=-1;previewStatus="idle";previewError="";
  lastSaleResponse=null;lastReceiptHtml=null;receiptInvoice="";resumedHeldId=null;
  terminalInvoiceId=await window.posAPI.getTerminalInvoiceId();
  renderServerTaxRows();renderCart();cartMessage(message);focusCart();
}
async function startNewSaleAfterReceipt():Promise<void>{
  document.querySelector<HTMLDialogElement>("#receipt-dialog")?.close();
  await clearActiveSale("Ready for next sale");
}
// Receipt close behaves differently for a just-completed sale vs. a duplicate viewed from history.
async function closeReceiptDialog():Promise<void>{
  if(receiptMode==="history"){document.querySelector<HTMLDialogElement>("#receipt-dialog")?.close();focusCart();return;}
  await startNewSaleAfterReceipt();
}

// ---------------- Phase 3: Hold / Resume ----------------
async function holdCurrentSale():Promise<void>{
  if(!cartLines.length){cartMessage("Cart is empty — nothing to hold");return;}
  const totals=fbrTotalsView();
  const time=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  const customerName=selectedCustomer?(selectedCustomer.customer_name||selectedCustomer.name):"Walk-in";
  let count=1; try{count=(await window.posAPI.listHeldSales()).length+1;}catch{/* offline-safe */}
  const defaultName=`Hold ${String(count).padStart(3,"0")} — ${customerName} — ${time}`;
  const name=(window.prompt("Name this held sale:",defaultName)??"").trim()||defaultName;
  const heldTerminalId=terminalInvoiceId;
  try{
    await window.posAPI.holdSale({
      terminalInvoiceId:heldTerminalId,displayName:name,
      customer:selectedCustomer?.name??"",customerName,
      posProfile:document.querySelector<HTMLSelectElement>("#pos-profile")?.value??"",
      company:document.querySelector<HTMLElement>("#config-company")?.textContent??"",
      branch:document.querySelector<HTMLInputElement>("#branch")?.value??"",
      openingEntry:sessionState.openingEntry,
      cart:cartLines,payments:paymentRows,benefits:{...appliedBenefits},
      totals:{grandTotal:totals.grandTotal,salesTax:totals.salesTax,serviceFee:totals.serviceFee,payable:totals.payable},
      validationSnapshot:{currentCartVersion,validatedCartVersion,paymentPreparedVersion,previewStatus},
      itemCount:cartLines.length,estimatedTotal:totals.payable
    });
    // Free the held terminal id so the next sale gets a fresh UUID; the held record keeps the original.
    await window.posAPI.setSaleStatus(heldTerminalId,"Held");
    clearSessionInvalid();
    await clearActiveSale(`Held: ${name}`);
    showScreen("pos");
  }catch(error){cartMessage(error instanceof Error?`Hold failed: ${error.message}`:"Hold failed");}
}

async function openHeldSales():Promise<void>{ showScreen("held-sales"); await renderHeldSales(); }
async function renderHeldSales():Promise<void>{
  const list=document.querySelector<HTMLElement>("#held-list"); const msg=document.querySelector<HTMLElement>("#held-message"); if(!list)return;
  let rows:HeldSaleSummary[]=[]; try{rows=await window.posAPI.listHeldSales();}catch{if(msg)msg.textContent="Unable to load held sales.";}
  if(msg)msg.textContent=rows.length?"":"";
  if(!rows.length){list.replaceChildren(Object.assign(document.createElement("div"),{className:"op-empty",textContent:"No held sales."}));return;}
  list.replaceChildren(...rows.map((row)=>{
    const card=document.createElement("div");card.className="op-card";
    const main=document.createElement("div");main.className="op-card-main";
    const title=document.createElement("div");title.className="op-card-title";title.textContent=row.displayName||`Hold #${row.id}`;
    const meta=document.createElement("div");meta.className="op-card-meta";
    meta.textContent=`${new Date(row.createdAt).toLocaleString()} · ${row.customerName||"Walk-in"} · ${row.itemCount} item(s) · Est ${row.estimatedTotal.toFixed(2)} · ${row.posProfile} · Entry ${row.openingEntry||"—"}`;
    main.append(title,meta);
    const actions=document.createElement("div");actions.className="op-card-actions";
    const resume=document.createElement("button");resume.type="button";resume.textContent="Resume";resume.onclick=()=>void resumeHeldSale(row.id);
    const rename=document.createElement("button");rename.type="button";rename.className="secondary-button";rename.textContent="Rename";rename.onclick=()=>void renameHeldSaleUi(row.id,row.displayName);
    const del=document.createElement("button");del.type="button";del.className="secondary-button";del.textContent="Delete";del.onclick=()=>void deleteHeldSaleUi(row.id);
    actions.append(resume,rename,del);
    card.append(main,actions);return card;
  }));
}
async function renameHeldSaleUi(id:number,current:string):Promise<void>{ const name=(window.prompt("Rename held sale:",current)??"").trim(); if(!name)return; await window.posAPI.renameHeldSale(id,name); await renderHeldSales(); }
async function deleteHeldSaleUi(id:number):Promise<void>{ if(!window.confirm("Delete this held draft? Submitted invoices are never affected."))return; await window.posAPI.deleteHeldSale(id); await renderHeldSales(); }

async function resumeHeldSale(id:number):Promise<void>{
  if(cartLines.length&&!window.confirm("Replace the current cart with the held sale?"))return;
  const held=await window.posAPI.getHeldSale(id); if(!held){cartMessage("Held sale not found");await renderHeldSales();return;}
  // Restore exact cart, customer, benefits and the ORIGINAL terminal_invoice_id.
  cartLines=Array.isArray(held.cart)?held.cart as CartLine[]:[];
  selectedCartIndex=cartLines.length?0:-1;
  paymentRows=Array.isArray(held.payments)?held.payments as PaymentRow[]:[];
  const benefits=held.benefits??{};
  appliedBenefits={loyaltyPoints:Number(benefits.loyaltyPoints)||0,couponCode:String(benefits.couponCode??"")};
  terminalInvoiceId=held.terminalInvoiceId;
  if(held.customer){selectedCustomer={name:held.customer,customer_name:held.customerName||held.customer,customer_group:"",mobile_no:"",email_id:"",tax_id:""};showCustomer();}
  // Reset validation; saved payments are outdated until re-prepared.
  serverTotals=null;localFbrTotals=null;serverTaxRows=null;
  currentCartVersion++;validatedCartVersion=-1;paymentPreparedVersion=-1;previewStatus="idle";previewError="";activePreviewPromise=null;
  paymentsOutdated=paymentRows.length>0;changeDue=0;
  resumedHeldId=id;
  // Re-open the held terminal id for idempotency, persist, and recompute.
  try{await window.posAPI.setSaleStatus(terminalInvoiceId,"Open");}catch{/* non-fatal */}
  await persistCart();await persistPayments();await saveBenefitsDraft();
  showScreen("pos");
  renderCart();
  scheduleCartPreview();        // immediate local FBR + automatic server preview when online
  void validateSession("resume");
  cartMessage(`Resumed: ${held.displayName||`Hold #${id}`} — prepare payment again`);
}

// ---------------- Phase 4: Sales History + Duplicate Print ----------------
async function openSalesHistory():Promise<void>{ showScreen("sales-history"); await renderSalesHistory(); }
async function renderSalesHistory():Promise<void>{
  const list=document.querySelector<HTMLElement>("#history-list"); const msg=document.querySelector<HTMLElement>("#history-message"); if(!list)return;
  const search=document.querySelector<HTMLInputElement>("#history-search")?.value??"";
  const from=document.querySelector<HTMLInputElement>("#history-from")?.value??"";
  const to=document.querySelector<HTMLInputElement>("#history-to")?.value??"";
  if(msg)msg.textContent="Loading…";
  let rows:SalesHistoryRow[]=[];
  try{rows=await window.posAPI.listSalesHistory({search,dateFrom:from?`${from}T00:00:00.000Z`:"",dateTo:to?`${to}T23:59:59.999Z`:"",limit:50,offset:0});}
  catch{if(msg)msg.textContent="Unable to load sales history.";return;}
  if(msg)msg.textContent="";
  if(!rows.length){list.replaceChildren(Object.assign(document.createElement("div"),{className:"op-empty",textContent:"No matching sales."}));return;}
  list.replaceChildren(...rows.map((row)=>{
    const response=row.response??{}; const payload=row.payload??{};
    const fbr=interpretFbr(response);
    const grand=previewNumber(response,"grand_total","rounded_total")??previewNumber(asTotalsRecord(payload),"grand_total")??0;
    const card=document.createElement("div");card.className="op-card";
    const main=document.createElement("div");main.className="op-card-main";
    const title=document.createElement("div");title.className="op-card-title";title.textContent=row.posInvoice||"(no invoice)";
    const meta=document.createElement("div");meta.className="op-card-meta";
    meta.textContent=`${new Date(row.submittedAt||row.createdAt).toLocaleString()} · ${String(payload.customer??"—")} · ${grand?`Total ${grand.toFixed(2)}`:row.status} · Term ${row.terminalInvoiceId.slice(0,12)}… · Reprints ${row.reprintCount}`;
    const fbrTag=document.createElement("span");fbrTag.className=`fbr-tag ${fbr.accepted?"ok":"warn"}`;fbrTag.textContent=`FBR ${fbr.accepted?"Accepted":fbr.statusText}${fbr.invoiceNumber?` · ${fbr.invoiceNumber}`:""}`;
    main.append(title,meta,fbrTag);
    const actions=document.createElement("div");actions.className="op-card-actions";
    const view=document.createElement("button");view.type="button";view.className="secondary-button";view.textContent="View Receipt";view.onclick=()=>void viewHistoryReceipt(row);
    const dup=document.createElement("button");dup.type="button";dup.textContent="Print Duplicate";dup.disabled=!row.posInvoice;dup.onclick=()=>void printDuplicate(row);
    actions.append(view,dup);
    card.append(main,actions);return card;
  }));
}

async function viewHistoryReceipt(row:SalesHistoryRow):Promise<void>{
  receiptMode="history";
  const response=row.response??{}; const payload=row.payload??{};
  const posInvoice=row.posInvoice??"";
  receiptInvoice=posInvoice;
  setCartText("#receipt-title",`Receipt — ${posInvoice||"Unknown"}`);
  const printBtn=document.querySelector<HTMLButtonElement>("#receipt-print"); if(printBtn)printBtn.hidden=true;
  const dupBtn=document.querySelector<HTMLButtonElement>("#receipt-duplicate"); if(dupBtn){dupBtn.hidden=false;dupBtn.disabled=!posInvoice;dupBtn.onclick=()=>void printDuplicate(row);}
  const closeBtn=document.querySelector<HTMLButtonElement>("#receipt-close"); if(closeBtn)closeBtn.textContent="Close";
  // Structured fallback from stored payload/response (the iframe shows the authoritative receipt when retrieved).
  setCartText("#receipt-invoice",posInvoice||"—");
  setCartText("#receipt-posting",pickString(response,["posting_datetime","posting_date","creation"])||new Date(row.submittedAt||row.createdAt).toLocaleString());
  setCartText("#receipt-cashier",pickString(response,["owner","cashier","user"])||"—");
  setCartText("#receipt-customer",String(payload.customer??"—"));
  const items=Array.isArray(payload.items)?payload.items:[];
  const itemsBox=document.querySelector<HTMLElement>("#receipt-items");
  if(itemsBox)itemsBox.replaceChildren(...items.map((it)=>{const r=asTotalsRecord(it)??{};const div=document.createElement("div");div.className="receipt-item";[String(r.item_code??""),String(r.qty??r.quantity??""),"—","—"].forEach(t=>{const s=document.createElement("span");s.textContent=t;div.append(s);});return div;}));
  const fbrTotals={salesTax:previewNumber(response,"total_sales_tax")??0,serviceFee:previewNumber(response,"fbr_pos_service_fee")??0,grand:previewNumber(response,"grand_total","rounded_total")??0};
  setCartText("#receipt-before-tax",(fbrTotals.grand-fbrTotals.salesTax-fbrTotals.serviceFee>0?fbrTotals.grand-fbrTotals.salesTax-fbrTotals.serviceFee:0).toFixed(2));
  setCartText("#receipt-sales-tax",fbrTotals.salesTax.toFixed(2));
  setCartText("#receipt-service-fee",fbrTotals.serviceFee.toFixed(2));
  setCartText("#receipt-grand-total",fbrTotals.grand.toFixed(2));
  const payments=Array.isArray(payload.payments)?payload.payments:[];
  const payBox=document.querySelector<HTMLElement>("#receipt-payments");
  if(payBox)payBox.replaceChildren(...payments.map((p)=>{const r=asTotalsRecord(p)??{};const el=document.createElement("p");const a=document.createElement("span");a.textContent=String(r.mode_of_payment??"");const b=document.createElement("strong");b.textContent=(previewNumber(r,"amount")??0).toFixed(2);el.append(a,b);return el;}));
  setCartText("#receipt-change","0.00");
  const fbr=interpretFbr(response);
  setCartText("#receipt-fbr-status",fbr.statusText);setCartText("#receipt-fbr-number",fbr.invoiceNumber||"—");
  const badge=document.querySelector<HTMLElement>("#receipt-fbr-badge");if(badge){badge.textContent=fbr.accepted?"FBR Accepted":fbr.statusText;badge.className=`fbr-badge ${fbr.accepted?"ok":"warn"}`;}
  const qrBox=document.querySelector<HTMLElement>("#receipt-qr");if(qrBox)qrBox.replaceChildren();
  lastReceiptHtml=null;
  const frame=document.querySelector<HTMLIFrameElement>("#receipt-frame");if(frame){frame.removeAttribute("srcdoc");frame.hidden=true;}
  const structured=document.querySelector<HTMLElement>("#receipt-structured");if(structured)structured.hidden=false;
  document.querySelector<HTMLDialogElement>("#receipt-dialog")?.showModal();
  if(posInvoice)await retrieveReceipt(posInvoice); else { const msg=document.querySelector<HTMLElement>("#receipt-message"); if(msg)msg.textContent="No POS Invoice recorded for this sale."; }
}

// Duplicate print: never creates an invoice, never calls submit/FBR; just re-renders with a DUPLICATE COPY banner.
async function printDuplicate(row:SalesHistoryRow):Promise<void>{
  const msg=document.querySelector<HTMLElement>("#receipt-message");
  if(!row.posInvoice){if(msg)msg.textContent="No POS Invoice to reprint.";return;}
  try{
    const result=await window.posAPI.getDuplicateReceipt(row.posInvoice);
    if(!result.html){if(msg)msg.textContent=`Receipt retrieval failed: ${result.error??"Unknown error"}`;return;}
    const printResult=await window.posAPI.printReceipt(result.html);
    if(printResult.success){const rec=await window.posAPI.recordReprint(row.terminalInvoiceId);if(msg)msg.textContent=`Duplicate sent to printer (reprint #${rec.reprintCount}).`;}
    else if(msg)msg.textContent=`Print failed: ${printResult.error??"Unknown error"}`;
  }catch(error){if(msg)msg.textContent=error instanceof Error?`Reprint failed: ${error.message}`:"Reprint failed";}
}

async function loadCustomerBenefits():Promise<void>{if(!selectedCustomer)return;if(!isOnline()){customerBenefits={loyaltyProgram:"",availablePoints:0,conversionFactor:1};return;}try{const result=await window.posAPI.getCustomerBenefits(selectedCustomer.name);customerBenefits={loyaltyProgram:result.loyaltyProgram??"",availablePoints:result.availablePoints,conversionFactor:result.conversionFactor};}catch{customerBenefits={loyaltyProgram:"",availablePoints:0,conversionFactor:1};}}

async function renderBenefits():Promise<void>{const dialog=document.querySelector<HTMLDialogElement>("#benefits-dialog");if(!dialog)return;const online=isOnline();const customerNameElem=document.querySelector<HTMLElement>("#benefits-customer");if(customerNameElem)customerNameElem.textContent=selectedCustomer?.customer_name??"—";const offlineMsg=document.querySelector<HTMLElement>("#benefits-offline-message");if(offlineMsg)offlineMsg.hidden=online;const loyaltySection=document.querySelector<HTMLElement>("#benefits-loyalty-section");const voucherSection=document.querySelector<HTMLElement>("#benefits-voucher-section");if(loyaltySection)loyaltySection.style.pointerEvents=online?"auto":"none";if(voucherSection)voucherSection.style.pointerEvents=online?"auto":"none";const programElem=document.querySelector<HTMLElement>("#benefits-loyalty-program");if(programElem)programElem.textContent=customerBenefits.loyaltyProgram||"—";const pointsElem=document.querySelector<HTMLElement>("#benefits-available-points");if(pointsElem)pointsElem.textContent=String(customerBenefits.availablePoints);const conversionElem=document.querySelector<HTMLElement>("#benefits-conversion-factor");if(conversionElem)conversionElem.textContent=String(customerBenefits.conversionFactor);const redeemInput=document.querySelector<HTMLInputElement>("#benefits-redeem-points");const maxBtn=document.querySelector<HTMLButtonElement>("#benefits-max-points");const couponInput=document.querySelector<HTMLInputElement>("#benefits-coupon-code");const applyBtn=document.querySelector<HTMLButtonElement>("#benefits-apply");const removeBtn=document.querySelector<HTMLButtonElement>("#benefits-remove");if(redeemInput){redeemInput.disabled=!online||!customerBenefits.loyaltyProgram;}if(maxBtn){maxBtn.disabled=!online||!customerBenefits.loyaltyProgram;}if(couponInput){couponInput.disabled=!online;}if(applyBtn){applyBtn.disabled=!online;}if(removeBtn){removeBtn.disabled=appliedBenefits.loyaltyPoints===0&&!appliedBenefits.couponCode;}const loyaltyValue=customerBenefits.conversionFactor>0?customerBenefits.availablePoints/customerBenefits.conversionFactor:0;const loyaltyElem=document.querySelector<HTMLElement>("#benefits-loyalty-value");if(loyaltyElem)loyaltyElem.textContent=loyaltyValue.toFixed(2); const redeemedPts=previewNumber(serverTotals,"redeemed_loyalty_points");const loyaltyAmt=previewNumber(serverTotals,"loyalty_amount"); const redeemedRow=document.querySelector<HTMLElement>("#benefits-redeemed-row");if(redeemedRow)redeemedRow.hidden=redeemedPts===null||redeemedPts===0; const redeemedElem=document.querySelector<HTMLElement>("#benefits-redeemed-points");if(redeemedElem)redeemedElem.textContent=redeemedPts!==null?String(redeemedPts):"0"; const loyaltyAmtRow=document.querySelector<HTMLElement>("#benefits-loyalty-amount-row");if(loyaltyAmtRow)loyaltyAmtRow.hidden=loyaltyAmt===null||loyaltyAmt===0; const loyaltyAmtElem=document.querySelector<HTMLElement>("#benefits-loyalty-amount");if(loyaltyAmtElem)loyaltyAmtElem.textContent=loyaltyAmt!==null?loyaltyAmt.toFixed(2):"0.00"; const appliedElem=document.querySelector<HTMLElement>("#benefits-applied");if(appliedElem){const parts:string[]=[];if(appliedBenefits.loyaltyPoints>0)parts.push(`Loyalty: ${appliedBenefits.loyaltyPoints} pts`);if(appliedBenefits.couponCode)parts.push(`Coupon: ${appliedBenefits.couponCode}`);appliedElem.textContent=parts.length?`Applied: ${parts.join(" + ")}`:"";}dialog.showModal();window.setTimeout(()=>document.querySelector<HTMLInputElement>("#benefits-redeem-points")?.focus(),0);}

async function applyBenefits():Promise<void>{const msg=document.querySelector<HTMLElement>("#benefits-message");try{const redeemInput=document.querySelector<HTMLInputElement>("#benefits-redeem-points");const couponInput=document.querySelector<HTMLInputElement>("#benefits-coupon-code");const redeemPoints=Number(redeemInput?.value)||0;const couponCode=(couponInput?.value??"").trim();if(redeemPoints>0&&redeemPoints>customerBenefits.availablePoints){if(msg)msg.textContent="Redeem points exceeds available points.";return;}appliedBenefits={loyaltyPoints:redeemPoints,couponCode:couponCode};await saveBenefitsDraft();if(msg)msg.textContent="Benefits applied — validating with server…";benefitsOutdated=false;if(paymentRows.length)paymentsOutdated=true;scheduleCartPreview();await renderBenefits();}catch(err){if(msg)msg.textContent=err instanceof Error?err.message:"Failed to apply benefits.";}}

async function removeBenefits():Promise<void>{appliedBenefits={loyaltyPoints:0,couponCode:""};await saveBenefitsDraft();const msg=document.querySelector<HTMLElement>("#benefits-message");if(msg)msg.textContent="Benefits removed.";if(paymentRows.length)paymentsOutdated=true;scheduleCartPreview();await renderBenefits();}

async function saveBenefitsDraft():Promise<void>{const draft:AppliedBenefits={...appliedBenefits,cartKey:cartLines.map(l=>l.itemCode).join("|")+"|"+cartLines.map(l=>l.quantity).join("|")};await window.posAPI.saveBenefitsDraft(draft);}

async function openBenefits():Promise<void>{await loadCustomerBenefits();appliedBenefits=await window.posAPI.loadBenefitsDraft()??{loyaltyPoints:0,couponCode:""};const redeemInput=document.querySelector<HTMLInputElement>("#benefits-redeem-points");if(redeemInput)redeemInput.value=String(appliedBenefits.loyaltyPoints);const couponInput=document.querySelector<HTMLInputElement>("#benefits-coupon-code");if(couponInput)couponInput.value=appliedBenefits.couponCode;await renderBenefits();}

function closeBenefitsDialog():void{document.querySelector<HTMLDialogElement>('#benefits-dialog')?.close();focusCart();}

function renderPaymentMethods():void{const box=document.querySelector<HTMLElement>("#payment-methods");if(!box)return;box.replaceChildren(...paymentMethods.map((m,i)=>{const b=document.createElement("button");b.type="button";b.className=`secondary-button search-result${i===selectedPaymentMethodIndex?" selected":""}`;b.textContent=m;b.onclick=()=>{selectedPaymentMethodIndex=i;renderPaymentMethods();document.querySelector<HTMLInputElement>("#payment-amount")?.focus();};return b;}));}
async function openPayment():Promise<void>{
  // F6 gate: validate the POS session, then require the current cart version to be server-validated.
  if(!cartLines.length){cartMessage("Cart is empty");return;}
  if(!(await validateSession("pay"))){showSessionInvalid(sessionState.reason);return;}
  if(validatedCartVersion!==currentCartVersion&&!activePreviewPromise)scheduleCartPreview();
  const pending=activePreviewPromise; // wait for the current validation if one is running
  if(pending){showPreviewStatus("Validating…");await pending;}
  if(validatedCartVersion!==currentCartVersion){cartMessage(previewError?`Cannot open payment — ${previewError}`:"Cart is not server validated yet");return;}
  if(paymentsOutdated&&paymentRows.length){if(!confirm("Cart changed. Clear outdated payments?"))return;paymentRows=[];await persistPayments();paymentsOutdated=false;}paymentMethods=await window.posAPI.getPaymentMethods();paymentRows=await window.posAPI.loadPaymentDraft();changeDue=0;selectedPaymentMethodIndex=0;renderPaymentMethods();const amountInput=document.querySelector<HTMLInputElement>("#payment-amount");if(amountInput)amountInput.value="";const payMsg=document.querySelector<HTMLElement>("#payment-message");if(payMsg)payMsg.textContent="";renderPayments();document.querySelector<HTMLDialogElement>("#payment-dialog")?.showModal();window.setTimeout(()=>amountInput?.focus(),0);}
function renderCart(): void {
  const container = document.querySelector<HTMLElement>("#cart-rows"); if (!container) return; container.replaceChildren();
  cartLines.forEach((line, index) => { const row = document.createElement("button"); row.type = "button"; row.className = `cart-row${index === selectedCartIndex ? " selected" : ""}`; const cells = [line.itemCode,line.itemName,line.uom,String(line.quantity),String(line.sellingPrice ?? 0),"0.00",((line.sellingPrice ?? 0) * line.quantity).toFixed(2),`${line.actualStock ?? "—"}${line.actualStock !== null && line.quantity > line.actualStock ? " ⚠" : ""}`,"Void"]; cells.forEach((text) => { const cell=document.createElement("span");cell.textContent=text;row.append(cell); }); row.onclick = () => { selectedCartIndex = index; renderCart(); focusCart(); }; container.append(row); });
  const quantity = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const totals = fbrTotalsView();
  const paid = paymentRows.reduce((sum, row) => sum + row.amount, 0);
  (document.querySelector("#cart-item-count") as HTMLElement).textContent = String(cartLines.length);
  (document.querySelector("#cart-quantity") as HTMLElement).textContent = String(quantity);
  setCartText("#cart-sales-tax", totals.salesTax.toFixed(2));
  setCartText("#cart-service-fee", totals.serviceFee.toFixed(2));
  setCartText("#cart-grand-total", totals.payable.toFixed(2)); // amount due, FBR POS service fee included
  setCartText("#cart-paid", paid.toFixed(2));
  setCartText("#cart-change", changeDue.toFixed(2));
  // Display loyalty redemption and coupon
  const loyaltyDisplayEl=document.querySelector<HTMLElement>("#cart-loyalty-display");
  if(loyaltyDisplayEl){loyaltyDisplayEl.textContent=appliedBenefits.loyaltyPoints>0?`Loyalty Redeemed: ${appliedBenefits.loyaltyPoints} pts (${totals.loyaltyAmount.toFixed(2)})`:"";}
  const couponDisplayEl=document.querySelector<HTMLElement>("#cart-coupon-display");
  if(couponDisplayEl){couponDisplayEl.textContent=appliedBenefits.couponCode?`Coupon: ${appliedBenefits.couponCode}`:"";}
  updateCompleteSaleState();
}
async function addToCart(item: CatalogSearchResult): Promise<void> { const index = cartLines.findIndex((line) => line.itemCode === item.itemCode && line.uom === item.uom); if (index >= 0) { cartLines[index].quantity += 1; selectedCartIndex = index; cartMessage("Quantity changed"); } else { cartLines.push({ ...item, quantity: 1 }); selectedCartIndex = cartLines.length - 1; cartMessage("Item added"); } // mark payment allocation outdated when cart changes
  if (paymentRows.length) paymentsOutdated = true;
  await persistCart(); clearCartSearch(); serverTotals=null;scheduleCartPreview(); renderCart(); focusCart(); }

async function changeCartQuantity(delta: number): Promise<void> { if (selectedCartIndex < 0) return; cartLines[selectedCartIndex].quantity += delta; if (cartLines[selectedCartIndex].quantity <= 0) { cartLines.splice(selectedCartIndex, 1); selectedCartIndex = Math.min(selectedCartIndex, cartLines.length - 1); cartMessage("Item voided"); } else cartMessage("Quantity changed"); // mark payment allocation outdated when cart changes
  if (paymentRows.length) paymentsOutdated = true;
  await persistCart(); serverTotals=null;scheduleCartPreview(); renderCart(); focusCart(); }

async function removeSelectedCartRow(): Promise<void> { if (selectedCartIndex < 0 || !confirm("Remove selected item?")) return; cartLines.splice(selectedCartIndex, 1); selectedCartIndex = Math.min(selectedCartIndex, cartLines.length - 1); // mark payment allocation outdated when cart changes
  if (paymentRows.length) paymentsOutdated = true;
  await persistCart(); serverTotals=null;scheduleCartPreview(); renderCart(); cartMessage("Item voided"); focusCart(); }
function editSelectedQuantity(): void { if (selectedCartIndex < 0) return; const dialog = document.querySelector<HTMLDialogElement>("#quantity-dialog"); const input = document.querySelector<HTMLInputElement>("#quantity-input"); if (!dialog || !input) return; input.value = String(cartLines[selectedCartIndex].quantity); dialog.showModal(); window.setTimeout(() => { input.focus(); input.select(); }, 0); }
async function saveDialogQuantity(): Promise<void> { const dialog = document.querySelector<HTMLDialogElement>("#quantity-dialog"); const input = document.querySelector<HTMLInputElement>("#quantity-input"); const quantity = Number(input?.value); if (!Number.isFinite(quantity) || quantity < 0 || selectedCartIndex < 0) { dialog?.close(); focusCart(); return; } if (quantity === 0) { cartLines.splice(selectedCartIndex, 1); selectedCartIndex = Math.min(selectedCartIndex, cartLines.length - 1); } else cartLines[selectedCartIndex].quantity = quantity; // mark payment allocation outdated when cart changes
  if (paymentRows.length) paymentsOutdated = true;
  await persistCart(); serverTotals=null;scheduleCartPreview(); renderCart(); cartMessage("Quantity changed"); dialog?.close(); focusCart(); }

function showCartSearchResults(results: CatalogSearchResult[], preserveSelection = false): void { cartSearchResults = results.slice(0, 7); if (!preserveSelection) selectedSearchIndex = 0; selectedSearchIndex = Math.min(selectedSearchIndex, Math.max(0, cartSearchResults.length - 1)); const container = document.querySelector<HTMLElement>("#cart-search-results"); if (!container) return; container.replaceChildren(...cartSearchResults.map((item, index) => { const button = document.createElement("button"); button.type="button"; button.className=`secondary-button search-result${index === selectedSearchIndex ? " selected" : ""}`; const price = item.sellingPrice === null ? "—" : `${item.sellingPrice.toFixed(2)} ${item.currency ?? ""}`; const stock = item.actualStock === null ? "—" : String(item.actualStock); button.innerHTML=`<span class="search-code">${item.itemCode}</span><span class="search-name">${item.itemName}</span><span class="search-meta">${item.uom} · ${price} · Stock ${stock}</span>`; button.onclick=()=>void addToCart(item); return button; })); container.querySelector<HTMLElement>(".selected")?.scrollIntoView({ block: "nearest" }); }
async function runSlashSearch(): Promise<void> { const query = (cartInput()?.value ?? "").slice(1).trim(); if (!query) { showCartSearchResults([]); return; } const lookup = await window.posAPI.lookupCatalog(query); showCartSearchResults(lookup.exact ? [lookup.exact] : lookup.results); cartMessage(cartSearchResults.length ? "Search results" : "No active sales item found"); }
async function scanCartInput(): Promise<void> { const input = cartInput(); const query = input?.value.trim() ?? ""; if (!query) return; if (slashSearchEnabled && query.startsWith("/")) { if (cartSearchResults.length) await addToCart(cartSearchResults[selectedSearchIndex] ?? cartSearchResults[0]); else await runSlashSearch(); return; } const lookup = await window.posAPI.lookupCatalog(query); if (lookup.exact) { await addToCart(lookup.exact); return; } showCartSearchResults(lookup.results); cartMessage(lookup.results.length ? "Select an item" : "No active sales item found"); }

function sessionStr(record: Record<string, unknown> | null, ...keys: string[]): string {
  for (const key of keys) { const value = record?.[key]; if (typeof value === "string" && value) return value; if (typeof value === "number") return String(value); }
  return "";
}
function dateOnly(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : parsed.toISOString().slice(0, 10);
}
function formatSessionAge(periodStart: string): string {
  const start = new Date(periodStart).getTime();
  if (!periodStart || Number.isNaN(start)) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - start) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
function renderSessionInfo(): void {
  setCartText("#pos-session-age", sessionState.valid ? formatSessionAge(sessionState.periodStart) : "—");
  const warning = document.querySelector<HTMLElement>("#pos-session-warning");
  if (warning) {
    const openedDate = dateOnly(sessionState.periodStart);
    const today = new Date().toISOString().slice(0, 10);
    const stale = Boolean(sessionState.valid && openedDate && openedDate !== today);
    warning.hidden = !stale;
    if (stale) warning.textContent = "Shift was opened on a previous date";
  }
}
function applySessionToHeader(): void {
  setCartText("#session-opening-entry", sessionState.openingEntry || "No active POS Opening Entry");
  if (sessionState.user) setCartText("#session-user", sessionState.user);
  updatePosHeader();
  const sync = document.querySelector<HTMLElement>("#pos-sync-status"); if (sync) sync.textContent = sessionState.valid ? "Ready" : "Session Invalid";
}
function showSessionInvalid(reason: string): void {
  setCartText("#session-invalid-reason", reason || sessionState.reason || "POS session is no longer active");
  const switchBtn = document.querySelector<HTMLButtonElement>("#session-switch"); if (switchBtn) switchBtn.hidden = !pendingSwitchEntry;
  const overlay = document.querySelector<HTMLElement>("#session-invalid-overlay"); if (overlay) overlay.hidden = false;
}
function clearSessionInvalid(): void {
  const overlay = document.querySelector<HTMLElement>("#session-invalid-overlay"); if (overlay) overlay.hidden = true;
}
function failSession(reason: string, switchEntry = ""): boolean {
  sessionState.valid = false; sessionState.reason = reason; pendingSwitchEntry = switchEntry;
  applySessionToHeader(); renderSessionInfo(); updateCompleteSaleState();
  return false;
}
// Revalidate the active POS Opening Entry against the cached session. Never creates/replaces an entry silently.
async function validateSession(trigger: string): Promise<boolean> {
  if (sessionCheckInFlight) return sessionCheckInFlight;          // coalesce overlapping checks
  sessionCheckInFlight = runSessionValidation(trigger).finally(() => { sessionCheckInFlight = null; });
  return sessionCheckInFlight;
}
async function runSessionValidation(_trigger: string): Promise<boolean> {
  sessionState.lastChecked = Date.now();
  if (!isOnline()) { renderSessionInfo(); return sessionState.valid; } // offline: keep last known-good, don't invalidate
  const result = await window.posAPI.getActivePosSession();
  showSessionDiagnostics(result);
  if (result.apiUser) authenticatedUser = result.apiUser;
  const selectedProfile = document.querySelector<HTMLSelectElement>("#pos-profile")?.value || sessionState.posProfile;
  const session = result.session && typeof result.session === "object" ? result.session as Record<string, unknown> : null;
  if (!session) { sessionHasEntry = false; return failSession(result.diagnosticReason || result.error || "No active POS Opening Entry"); }
  sessionHasEntry = true;
  const name = sessionStr(session, "opening_entry", "name");
  const status = sessionStr(session, "status") || "Open";
  const docstatus = previewNumber(session, "docstatus");
  const profile = sessionStr(session, "pos_profile") || result.requestedPosProfile;
  const user = sessionStr(session, "user") || authenticatedUser;
  const periodStart = sessionStr(session, "period_start_date", "posting_date", "creation");
  if (!name) return failSession("Opening Entry name is missing");
  if (docstatus !== null && docstatus !== 1) return failSession("Opening Entry is not submitted (docstatus ≠ 1)");
  if (status !== "Open") return failSession(`Shift status is ${status}`);
  if (selectedProfile && profile && profile !== selectedProfile) return failSession(`Active shift uses POS Profile ${profile}, not ${selectedProfile}`);
  if (authenticatedUser && user && user !== authenticatedUser) return failSession(`Active shift belongs to ${user}`);
  if (sessionState.openingEntry && name !== sessionState.openingEntry) {
    // A different open entry is returned — never switch silently.
    if (cartLines.length) return failSession(`A different shift (${name}) is active. Confirm to switch.`, name);
    if (!confirm(`A different shift (${name}) is active. Switch to it?`)) return failSession(`A different shift (${name}) is active`, name);
  }
  sessionState = { openingEntry: name, status, user, posProfile: profile || selectedProfile, periodStart, lastChecked: Date.now(), valid: true, reason: "" };
  pendingSwitchEntry = "";
  clearSessionInvalid(); applySessionToHeader(); renderSessionInfo(); updateCompleteSaleState();
  return true;
}
// Used by background triggers (interval/focus/reconnect): show the overlay only while the cashier is on the POS screen.
async function revalidateLive(trigger: string): Promise<void> {
  const ok = await validateSession(trigger);
  const posScreen = document.querySelector<HTMLElement>("#pos-screen");
  if (posScreen && !posScreen.hidden) { if (ok) clearSessionInvalid(); else showSessionInvalid(sessionState.reason); }
}
async function switchToActiveShift(): Promise<void> {
  if (!pendingSwitchEntry) return;
  if (cartLines.length && !confirm("Switching shifts keeps the current cart, customer and payment. Continue?")) return;
  sessionState.openingEntry = ""; // drop cached entry so the returned one is adopted
  const ok = await validateSession("switch");
  if (ok) { clearSessionInvalid(); showScreen("pos"); }
}
async function goToPos(): Promise<void> {
  const ok = await validateSession("back-to-pos");
  if (ok) { clearSessionInvalid(); showScreen("pos"); }
  else if (!sessionHasEntry) { void showStartShift(); }
  else { showScreen("pos"); showSessionInvalid(sessionState.reason); }
}

async function runStartup(): Promise<void> {
  const progress = document.querySelector<HTMLElement>("#startup-progress"); const retry = document.querySelector<HTMLButtonElement>("#retry-startup");
  const serverStatus = document.querySelector<HTMLElement>("#pos-server-status");
  try {
    if (retry) retry.hidden = true; if (progress) progress.textContent = "Connecting";
    await loadSettingsIntoForm();
    // Settings / authentication missing -> Settings.
    const saved = await window.posAPI.loadSettings();
    if (!saved.erpnextUrl || !saved.apiKey || !saved.hasApiSecret || !saved.posProfile) { if (progress) progress.textContent = "Terminal settings required"; showSettingsMessage("Complete terminal settings to begin."); showScreen("settings"); return; }
    const server = await window.posAPI.testServer();
    if (!server.connected) { if (serverStatus) serverStatus.textContent = "Offline"; prevServerConnected = false; if (progress) progress.textContent = "Server not connected"; showSettingsMessage("Server not reachable. Check ERPNext URL / connection."); showScreen("settings"); return; }
    if (serverStatus) serverStatus.textContent = "Online"; prevServerConnected = true;
    const login = await window.posAPI.testLogin();
    if (!login.success) { if (progress) progress.textContent = "Login Failed"; showSettingsMessage("Authentication failed. Check API Key and Secret."); showScreen("settings"); return; }
    authenticatedUser = login.loggedUser ?? "";
    if (progress) progress.textContent = "Authenticated";
    await populatePosProfileDropdown();
    const profile = await window.posAPI.loadPosProfile();
    if (!profile.success) { if (progress) progress.textContent = profile.error ?? "POS Profile Load Failed"; showSettingsMessage(profile.error ?? "POS Profile load failed."); showScreen("settings"); return; }
    showPosProfile(profile.profile, profile.error); if (progress) progress.textContent = "POS Profile Loaded";
    if (profile.profile?.customer) { const defaultCustomer={ name: profile.profile.customer, customer_name: profile.profile.customer, customer_group: "", mobile_no: "", email_id: "", tax_id: "" }; selectedCustomer=defaultCustomer; const customer=await window.posAPI.loadCustomer(defaultCustomer.name); if(customer.customer) selectedCustomer={...defaultCustomer,customer_name:String(customer.customer.customer_name??defaultCustomer.customer_name),customer_group:String(customer.customer.customer_group??""),mobile_no:String(customer.customer.mobile_no??""),email_id:String(customer.customer.email_id??""),tax_id:String(customer.customer.tax_id??"")}; showCustomer(); }
    await loadCachedPosConfiguration();
    // Validate the active POS Opening Entry and route accordingly.
    const ok = await validateSession("startup");
    updatePosHeader();
    if (ok) { if (progress) progress.textContent = "Ready"; showScreen("pos"); }
    else if (!sessionHasEntry) { if (progress) progress.textContent = "No active POS Opening Entry"; void showStartShift(); }
    else { if (progress) progress.textContent = sessionState.reason; showScreen("pos"); showSessionInvalid(sessionState.reason); }
  } catch (error) { if (progress) progress.textContent = error instanceof Error ? error.message : "Startup failed"; if (retry) retry.hidden = false; showScreen("settings"); }
}

function getSettingsFromForm(): AppSettings {
  return {
    erpnextUrl: document.querySelector<HTMLInputElement>("#erpnext-url")?.value ?? "",
    apiKey: document.querySelector<HTMLInputElement>("#api-key")?.value ?? "",
    apiSecret: document.querySelector<HTMLInputElement>("#api-secret")?.value ?? "",
    terminalId: document.querySelector<HTMLInputElement>("#terminal-id")?.value ?? "",
    posProfile: document.querySelector<HTMLSelectElement>("#pos-profile")?.value ?? "",
    branch: document.querySelector<HTMLInputElement>("#branch")?.value ?? "",
    warehouse: document.querySelector<HTMLInputElement>("#warehouse")?.value ?? ""
  };
}

function populateSettingsForm(settings: RendererSettings): void {
  (document.querySelector<HTMLInputElement>("#erpnext-url") as HTMLInputElement).value = settings.erpnextUrl;
  (document.querySelector<HTMLInputElement>("#api-key") as HTMLInputElement).value = settings.apiKey;
  (document.querySelector<HTMLInputElement>("#api-secret") as HTMLInputElement).value = "";
  (document.querySelector<HTMLInputElement>("#api-secret") as HTMLInputElement).placeholder = settings.hasApiSecret
    ? "Saved securely; enter to replace"
    : "Enter to save";
  (document.querySelector<HTMLInputElement>("#terminal-id") as HTMLInputElement).value = settings.terminalId;
  (document.querySelector<HTMLSelectElement>("#pos-profile") as HTMLSelectElement).dataset.savedValue = settings.posProfile;
  (document.querySelector<HTMLInputElement>("#branch") as HTMLInputElement).value = settings.branch;
  (document.querySelector<HTMLInputElement>("#warehouse") as HTMLInputElement).value = settings.warehouse;
}

function showSettingsMessage(message: string): void {
  const messageElement = document.querySelector<HTMLElement>("#settings-message");
  if (messageElement) {
    messageElement.textContent = message;
  }
}

function showServerStatus(connected: boolean): void {
  const statusElement = document.querySelector<HTMLElement>("#server-status");
  if (statusElement) {
    statusElement.textContent = connected ? "Connected" : "Not Connected";
  }
}

function showLoginResult(message: string): void {
  const resultElement = document.querySelector<HTMLElement>("#login-result");
  if (resultElement) {
    resultElement.textContent = message;
  }
}

function showPosProfile(profile: PosProfileDetails | null, error: string | null = null): void {
  const detailsElement = document.querySelector<HTMLElement>("#pos-profile-details");
  if (!profile || !detailsElement) {
    if (detailsElement) {
      detailsElement.hidden = true;
    }
    showSettingsMessage(error ? `POS Profile Load Failed: ${error}` : "POS Profile Load Failed");
    return;
  }

  const values: Record<string, string> = {
    "#profile-company": profile.company,
    "#profile-warehouse": profile.warehouse,
    "#profile-customer": profile.customer,
    "#profile-price-list": profile.priceList,
    "#profile-currency": profile.currency,
    "#profile-payment-count": String(profile.paymentMethodsCount)
  };

  for (const [selector, value] of Object.entries(values)) {
    const field = document.querySelector<HTMLElement>(selector);
    if (field) {
      field.textContent = value || "—";
    }
  }

  const branchInput = document.querySelector<HTMLInputElement>("#branch");
  if (branchInput) {
    branchInput.value = profile.branch;
  }

  detailsElement.hidden = false;
  showSettingsMessage(profile.branch ? "" : "Branch not configured in POS Profile");
}

async function loadSettingsIntoForm(): Promise<void> {
  try {
    const settings = await window.posAPI.loadSettings();
    populateSettingsForm(settings);
    showSettingsMessage("Settings Loaded");
  } catch {
    showSettingsMessage("Unable to load settings");
  }
}

async function populatePosProfileDropdown(): Promise<void> {
  const select = document.querySelector<HTMLSelectElement>("#pos-profile");
  if (!select) {
    return;
  }

  const result = await window.posAPI.loadPosProfiles();
  if (!result.success) {
    throw new Error(result.error ?? "Unable to load POS Profiles");
  }

  const savedValue = select.dataset.savedValue ?? select.value;
  select.replaceChildren();

  if (result.profiles.length !== 1) {
    select.add(new Option("Select a POS Profile", ""));
  }

  for (const profile of result.profiles) {
    const details = [profile.company, profile.warehouse].filter(Boolean).join(" · ");
    select.add(new Option(details ? `${profile.name} — ${details}` : profile.name, profile.name));
  }

  if (result.profiles.length === 1) {
    select.value = result.profiles[0].name;
  } else if (result.profiles.some((profile) => profile.name === savedValue)) {
    select.value = savedValue;
  }

  if (select.value) {
    await window.posAPI.saveSettings(getSettingsFromForm());
  }
  showSettingsMessage(result.profiles.length ? "POS Profiles Loaded" : "No POS Profiles available");
}

window.addEventListener("DOMContentLoaded", () => {
  void showDatabaseStatus();
  void loadPosProfileCacheStatus();
  void loadSettingsIntoForm();
  void loadCachedPosConfiguration();
  void loadCachedPosSession();
  void window.posAPI.getCatalogTotals().then(showCatalogTotals);
  window.posAPI.onCatalogProgress(showCatalogProgress);
  void window.posAPI.loadCart().then((state) => { cartLines = state.lines; selectedCartIndex = cartLines.length ? 0 : -1; renderCart(); focusCart(); }); void window.posAPI.loadBenefitsDraft().then((draft) => { if(draft) appliedBenefits = draft; }); void window.posAPI.getTerminalInvoiceId().then((id)=>{terminalInvoiceId=id;}); window.posAPI.onCompleteSaleShortcut(()=>void submitCurrentSale());
  void runStartup();
  window.addEventListener("online", () => scheduleCartPreview());
  document.querySelector<HTMLButtonElement>("#retry-startup")?.addEventListener("click", () => void runStartup());
  document.querySelector<HTMLButtonElement>("#start-shift")?.addEventListener("click", () => void startShift());
  document.querySelector<HTMLButtonElement>("#open-settings")?.addEventListener("click", () => showScreen("settings"));
  document.querySelector<HTMLButtonElement>("#back-to-pos")?.addEventListener("click", () => void goToPos());
  // Session-invalid overlay actions (non-destructive — cart/customer/payment preserved).
  document.querySelector<HTMLButtonElement>("#session-refresh")?.addEventListener("click", () => void revalidateLive("refresh"));
  document.querySelector<HTMLButtonElement>("#session-switch")?.addEventListener("click", () => void switchToActiveShift());
  document.querySelector<HTMLButtonElement>("#session-go-shift")?.addEventListener("click", () => { clearSessionInvalid(); void showStartShift(); });
  document.querySelector<HTMLButtonElement>("#session-open-settings")?.addEventListener("click", () => { clearSessionInvalid(); showScreen("settings"); });
  // Revalidate the POS session whenever the window regains focus.
  window.addEventListener("focus", () => { if (isOnline()) void revalidateLive("focus"); });
  // Server-health poll (online/offline + reconnect-driven session revalidation).
  window.setInterval(async () => { try { const online = await window.posAPI.testServer(); const status = document.querySelector<HTMLElement>("#pos-server-status"); const connected = Boolean(online.connected); if (status) status.textContent = connected ? "Online" : "Offline";
      if (connected && !prevServerConnected) { scheduleCartPreview(); void revalidateLive("reconnect"); } // after reconnect, re-check the session
      prevServerConnected = connected;
    } catch { const status = document.querySelector<HTMLElement>("#pos-server-status"); if (status) status.textContent = "Reconnecting"; prevServerConnected = false; } }, 30_000);
  // Revalidate the POS session every 60 seconds while online.
  window.setInterval(() => { if (isOnline()) void revalidateLive("interval"); }, 60_000);

  document.querySelector<HTMLFormElement>("#settings-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await window.posAPI.saveSettings(getSettingsFromForm());
      showSettingsMessage("Settings Saved");
    } catch {
      showSettingsMessage("Unable to save settings");
    }
  });

  document.querySelector<HTMLButtonElement>("#load-settings")?.addEventListener("click", async () => {
    await loadSettingsIntoForm();
  });

  document.querySelector<HTMLButtonElement>("#test-server")?.addEventListener("click", async () => {
    const button = document.querySelector<HTMLButtonElement>("#test-server");
    if (button) {
      button.disabled = true;
      button.textContent = "Testing...";
    }

    try {
      const result = await window.posAPI.testServer();
      showServerStatus(result.connected);
    } catch {
      showServerStatus(false);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Test Server";
      }
    }
  });

  document.querySelector<HTMLButtonElement>("#test-login")?.addEventListener("click", async () => {
    const button = document.querySelector<HTMLButtonElement>("#test-login");
    if (button) {
      button.disabled = true;
      button.textContent = "Testing...";
    }

    try {
      const result = await window.posAPI.testLogin();
      showLoginResult(result.success && result.loggedUser ? `Logged User: ${result.loggedUser}` : "Login Failed");
      if (result.success) {
        await populatePosProfileDropdown();
      }
    } catch {
      showLoginResult("Login Failed");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Test Login";
      }
    }
  });

  document.querySelector<HTMLSelectElement>("#pos-profile")?.addEventListener("change", async () => {
    try {
      await window.posAPI.saveSettings(getSettingsFromForm());
      showSettingsMessage("POS Profile Saved");
    } catch {
      showSettingsMessage("Unable to save POS Profile");
    }
  });

  document.querySelector<HTMLButtonElement>("#load-pos-profile")?.addEventListener("click", async () => {
    const button = document.querySelector<HTMLButtonElement>("#load-pos-profile");
    if (button) {
      button.disabled = true;
      button.textContent = "Loading...";
    }

    try {
      await window.posAPI.saveSettings(getSettingsFromForm());
      const result = await window.posAPI.loadPosProfile();
      showPosProfile(result.success ? result.profile : null, result.error);
      if (result.success) {
        showPosProfileCacheStatus(true, result.syncedAt);
      }
    } catch {
      showPosProfile(null);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Load POS Profile";
      }
    }
  });

  document.querySelector<HTMLButtonElement>("#sync-pos-configuration")?.addEventListener("click", async () => {
    const button = document.querySelector<HTMLButtonElement>("#sync-pos-configuration");
    if (button) {
      button.disabled = true;
      button.textContent = "Syncing...";
    }

    try {
      await window.posAPI.saveSettings(getSettingsFromForm());
      const result = await window.posAPI.syncPosConfiguration();
      if (result.success) {
        showPosConfigurationSummary(result.summary);
        showSettingsMessage("POS Configuration Synced");
      } else {
        showSettingsMessage(`POS Configuration Sync Failed: ${result.error ?? "Unknown error"}`);
      }
    } catch {
      showSettingsMessage("POS Configuration Sync Failed");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Sync POS Configuration";
      }
    }
  });

  document.querySelector<HTMLButtonElement>("#sync-pos-session")?.addEventListener("click", async () => {
    const button = document.querySelector<HTMLButtonElement>("#sync-pos-session");
    if (button) {
      button.disabled = true;
      button.textContent = "Syncing...";
    }
    try {
      await window.posAPI.saveSettings(getSettingsFromForm());
      const result = await window.posAPI.syncPosSession();
      showPosSessionSummary(result.summary);
      showSettingsMessage(result.success
        ? (result.summary.sessionStatus === "Open" ? "POS Session Synced" : "No active POS Opening Entry")
        : `POS Session Sync Failed: ${result.error ?? "Unknown error"}`);
    } catch {
      showSettingsMessage("POS Session Sync Failed");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Sync POS Session";
      }
    }
  });

  document.querySelector<HTMLButtonElement>("#sync-item-catalog")?.addEventListener("click", async () => {
    const button = document.querySelector<HTMLButtonElement>("#sync-item-catalog");
    if (button) { button.disabled = true; button.textContent = "Syncing..."; }
    try {
      const result = await window.posAPI.syncItemCatalog();
      showCatalogTotals(result.totals);
      const barcodeStatus = document.querySelector<HTMLElement>("#barcode-sync-status");
      if (barcodeStatus) barcodeStatus.textContent = result.barcodeError ? `Barcode Sync: Failed — ${result.barcodeError}` : "Barcode Sync: Ready";
      showCatalogProgress(result.success ? (result.barcodeError ? `Catalog synced. Item Barcode error: ${result.barcodeError}` : "Catalog sync complete.") : `Catalog sync failed: ${result.error ?? "Unknown error"}`);
    } catch { showCatalogProgress("Catalog sync failed."); }
    finally { if (button) { button.disabled = false; button.textContent = "Sync Item Catalog"; } }
  });

  document.querySelector<HTMLButtonElement>("#sync-customers")?.addEventListener("click", async () => { const result=await window.posAPI.syncCustomers(); showSettingsMessage(result.success?`Customers synced: ${result.state.count}`:`Customer sync failed: ${result.error}`); });
  document.querySelector<HTMLButtonElement>("#sync-fbr-config")?.addEventListener("click", async () => { const button=document.querySelector<HTMLButtonElement>("#sync-fbr-config"); if(button){button.disabled=true;button.textContent="Syncing...";} try { const result=await window.posAPI.syncFbrConfig(); showSettingsMessage(result.success?"FBR configuration synced":`FBR sync failed: ${result.error??"Unknown error"}`); } catch { showSettingsMessage("FBR sync failed"); } finally { if(button){button.disabled=false;button.textContent="Sync FBR Configuration";} } });
  customerInput()?.addEventListener("input", () => void searchCustomer());
  document.querySelector<HTMLButtonElement>("#new-customer")?.addEventListener("click", () => void openNewCustomer());
  document.querySelector<HTMLButtonElement>("#cancel-new-customer")?.addEventListener("click", () => { document.querySelector<HTMLDialogElement>("#new-customer-dialog")?.close(); focusCart(); });
  document.querySelector<HTMLFormElement>("#new-customer-form")?.addEventListener("submit", async (event) => { event.preventDefault(); if(!isOnline()){const e=document.querySelector<HTMLElement>("#new-customer-error");if(e)e.textContent="Online connection required to create a customer.";return;} const input=(id:string)=>document.querySelector<HTMLInputElement|HTMLSelectElement>(id)?.value??""; const result=await window.posAPI.createCustomer({customer_name:input("#new-customer-name"),mobile_no:input("#new-customer-mobile"),email_id:input("#new-customer-email"),tax_id:input("#new-customer-tax"),customer_group:input("#new-customer-group"),territory:input("#new-customer-territory")}); const error=document.querySelector<HTMLElement>("#new-customer-error"); if(!result.customer){if(error)error.textContent=result.error??"Customer creation failed.";return;} const c=result.customer; selectedCustomer={name:String(c.name??""),customer_name:String(c.customer_name??""),customer_group:String(c.customer_group??""),mobile_no:String(c.mobile_no??""),email_id:String(c.email_id??""),tax_id:String(c.tax_id??"")}; showCustomer(); document.querySelector<HTMLDialogElement>("#new-customer-dialog")?.close(); document.querySelector<HTMLDialogElement>("#customer-dialog")?.close(); focusCart(); });

  document.querySelector<HTMLInputElement>("#catalog-search")?.addEventListener("input", async (event) => {
    const query = (event.target as HTMLInputElement).value.trim();
    showCatalogResults(query ? await window.posAPI.searchCatalog(query) : []);
  });

  cartInput()?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void scanCartInput(); } });
  cartInput()?.addEventListener("input", () => { if (slashSearchEnabled && cartInput()?.value.startsWith("/")) void runSlashSearch(); else if (!cartInput()?.value) clearCartSearch(); });
  document.querySelector("#cart-qty")?.addEventListener("click", () => void editSelectedQuantity());
  document.querySelector("#cart-remove")?.addEventListener("click", () => void removeSelectedCartRow());
  document.querySelector("#cart-clear")?.addEventListener("click", async () => { if (!cartLines.length || !confirm("Clear the full cart?")) return; cartLines=[]; selectedCartIndex=-1; // mark payment allocation outdated when cart cleared
    if (paymentRows.length) paymentsOutdated = true;
    await persistCart(); serverTotals=null;scheduleCartPreview(); renderCart(); cartMessage("Cart cleared"); focusCart(); });
  document.querySelector<HTMLFormElement>("#quantity-form")?.addEventListener("submit", (event) => { event.preventDefault(); const submitter = event.submitter as HTMLButtonElement | null; if (submitter?.value === "cancel") { document.querySelector<HTMLDialogElement>("#quantity-dialog")?.close(); focusCart(); } else void saveDialogQuantity(); });
  document.querySelector<HTMLDialogElement>("#quantity-dialog")?.addEventListener("cancel", () => focusCart());
  // Payment dialog controls
  document.querySelector<HTMLButtonElement>('#open-payment')?.addEventListener('click', () => void openPayment());
  document.querySelector<HTMLButtonElement>('#open-benefits')?.addEventListener('click', () => void openBenefits());
  document.querySelector<HTMLButtonElement>('#payment-exact')?.addEventListener('click', () => void addExactAmount());
  document.querySelector<HTMLButtonElement>('#payment-add')?.addEventListener('click', () => void addPayment());
  document.querySelector<HTMLButtonElement>('#payment-complete')?.addEventListener('click', () => void completePaymentAllocation());
  document.querySelector<HTMLButtonElement>('#complete-sale')?.addEventListener('click', () => void submitCurrentSale());
  document.querySelector<HTMLInputElement>('#payment-amount')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void addPayment(); } });
  document.querySelector<HTMLInputElement>('#payment-amount')?.addEventListener('input', () => refreshPaymentSummary());
  // Receipt preview controls
  document.querySelector<HTMLButtonElement>('#receipt-print')?.addEventListener('click', () => void printReceiptNow());
  document.querySelector<HTMLButtonElement>('#receipt-reprint')?.addEventListener('click', () => void retrieveReceipt(receiptInvoice));
  document.querySelector<HTMLButtonElement>('#receipt-close')?.addEventListener('click', () => void closeReceiptDialog());
  // Hold / Held Sales / Sales History navigation (registered once).
  document.querySelector<HTMLButtonElement>('#hold-sale')?.addEventListener('click', () => void holdCurrentSale());
  document.querySelector<HTMLButtonElement>('#open-held-sales')?.addEventListener('click', () => void openHeldSales());
  document.querySelector<HTMLButtonElement>('#open-sales-history')?.addEventListener('click', () => void openSalesHistory());
  document.querySelector<HTMLButtonElement>('#held-back')?.addEventListener('click', () => void goToPos());
  document.querySelector<HTMLButtonElement>('#history-back')?.addEventListener('click', () => void goToPos());
  document.querySelector<HTMLButtonElement>('#history-refresh')?.addEventListener('click', () => void renderSalesHistory());
  document.querySelector<HTMLInputElement>('#history-search')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void renderSalesHistory(); } });
  document.querySelector<HTMLButtonElement>('#session-hold')?.addEventListener('click', () => void holdCurrentSale());
  // Escape must not silently discard a submitted-but-unclosed receipt; require the explicit button.
  document.querySelector<HTMLDialogElement>('#receipt-dialog')?.addEventListener('cancel', (e) => e.preventDefault());
  // Benefits dialog controls
  document.querySelector<HTMLButtonElement>('#benefits-max-points')?.addEventListener('click', () => { const input = document.querySelector<HTMLInputElement>('#benefits-redeem-points'); if (input) { input.value = String(customerBenefits.availablePoints); input.focus(); } });
  document.querySelector<HTMLButtonElement>('#benefits-apply')?.addEventListener('click', () => void applyBenefits());
  document.querySelector<HTMLButtonElement>('#benefits-remove')?.addEventListener('click', () => void removeBenefits());
  document.querySelector<HTMLInputElement>('#benefits-redeem-points')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void applyBenefits(); } });
  document.querySelector<HTMLInputElement>('#benefits-coupon-code')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void applyBenefits(); } });
  document.addEventListener("keydown", (event) => {
    // While the receipt preview is open the sale is already submitted; keep POS hotkeys off the underlying cart.
    if (document.querySelector<HTMLDialogElement>("#receipt-dialog")?.open) {
      if (["F2","F3","F4","F6","F7","F8","F9","F10"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); }
      return;
    }
    const benefitsDialog = document.querySelector<HTMLDialogElement>("#benefits-dialog");
    const paymentDialog = document.querySelector<HTMLDialogElement>("#payment-dialog");
    const quantityDialog = document.querySelector<HTMLDialogElement>("#quantity-dialog");
    const customerDialog = document.querySelector<HTMLDialogElement>("#customer-dialog");
    const newCustomerDialog = document.querySelector<HTMLDialogElement>("#new-customer-dialog");
    const scannerActive = document.activeElement === cartInput();
    const benefitsOpen = benefitsDialog?.open;
    const paymentOpen = paymentDialog?.open;
    if (event.key === 'F7') { event.preventDefault(); event.stopPropagation(); if (benefitsOpen) { closeBenefitsDialog(); } else { void openBenefits(); } return; }
    if (event.key === 'F9') { event.preventDefault(); event.stopPropagation(); void submitCurrentSale(); return; }
    if (benefitsOpen) {
      if (event.key === 'Tab') { /* default behavior for Tab */ return; }
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void applyBenefits(); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeBenefitsDialog(); return; }
    }
    if (event.key === 'F6') { event.preventDefault(); event.stopPropagation(); if (paymentOpen) { void completePaymentAllocation(); } else { void openPayment(); } return; }
    if (paymentOpen) {
      // Payment dialog keyboard controls
      if (event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); selectedPaymentMethodIndex = Math.max(0, selectedPaymentMethodIndex - 1); renderPaymentMethods(); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); selectedPaymentMethodIndex = Math.min(paymentMethods.length - 1, selectedPaymentMethodIndex + 1); renderPaymentMethods(); return; }
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); // select highlighted method -> focus amount
        document.querySelector<HTMLInputElement>('#payment-amount')?.focus(); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePaymentDialog(); return; }
      if (event.key === 'F6') { event.preventDefault(); event.stopPropagation(); void completePaymentAllocation(); return; }
    }
    if (event.ctrlKey && event.key.toLowerCase() === "h") { event.preventDefault(); event.stopPropagation(); void holdCurrentSale(); }
    else if (event.key === "F2") { event.preventDefault(); event.stopPropagation(); focusCart(); }
    else if (event.key === "F3") { event.preventDefault(); event.stopPropagation(); openCustomerSearch(); }
    else if (customerDialog?.open && event.ctrlKey && event.key.toLowerCase() === "n") { event.preventDefault(); event.stopPropagation(); void openNewCustomer(); }
    else if (customerDialog?.open && event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); selectedCustomerIndex=Math.max(0,selectedCustomerIndex-1); void searchCustomer(true); }
    else if (customerDialog?.open && event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); selectedCustomerIndex=Math.min(customerResults.length-1,selectedCustomerIndex+1); void searchCustomer(true); }
    else if (customerDialog?.open && event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if(customerResults[selectedCustomerIndex]) void selectCustomer(customerResults[selectedCustomerIndex]); }
    else if (event.key === "/" && slashSearchEnabled && !quantityDialog?.open) { event.preventDefault(); event.stopPropagation(); const input = cartInput(); if (input) { input.value = "/"; input.focus(); } clearCartSearch(); if (input) input.value = "/"; }
    else if (event.key === "Enter" && cartSearchResults.length && scannerActive) { event.preventDefault(); event.stopPropagation(); void addToCart(cartSearchResults[selectedSearchIndex] ?? cartSearchResults[0]); }
    else if (event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); if (cartSearchResults.length && scannerActive) { selectedSearchIndex = Math.max(0, selectedSearchIndex - 1); showCartSearchResults(cartSearchResults, true); } else if (cartLines.length) { selectedCartIndex = Math.max(0, selectedCartIndex - 1); renderCart(); } }
    else if (event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); if (cartSearchResults.length && scannerActive) { selectedSearchIndex = Math.min(cartSearchResults.length - 1, selectedSearchIndex + 1); showCartSearchResults(cartSearchResults, true); } else if (cartLines.length) { selectedCartIndex = Math.min(cartLines.length - 1, selectedCartIndex + 1); renderCart(); } }
    else if (event.key === "*" || event.key === "+") { event.preventDefault(); event.stopPropagation(); void changeCartQuantity(1); }
    else if (event.key === "-") { event.preventDefault(); event.stopPropagation(); void changeCartQuantity(-1); }
    else if (event.key === "F4") { event.preventDefault(); event.stopPropagation(); clearCartSearch(); void editSelectedQuantity(); }
    else if (event.key === "Delete" || event.key === "F8") { event.preventDefault(); event.stopPropagation(); clearCartSearch(); void removeSelectedCartRow(); }
    else if (event.key === "F10") { event.preventDefault(); event.stopPropagation(); (document.querySelector<HTMLButtonElement>("#cart-clear"))?.click(); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (quantityDialog?.open) quantityDialog.close(); if(newCustomerDialog?.open) newCustomerDialog.close(); if(customerDialog?.open) customerDialog.close(); clearCartSearch(); focusCart(); }
  }, true);
});
