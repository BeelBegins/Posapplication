interface DatabaseStatus {
  isReady: boolean;
  path: string;
  schemaVersion: string | null;
}

interface PosAPI {
  getDatabaseStatus: () => Promise<DatabaseStatus>;
  focusPosWindow: () => Promise<boolean>;
  onFocusScanner: (callback: () => void) => void;
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
  syncItemCatalog: (mode?: "auto" | "full") => Promise<{ success: boolean; totals: CatalogTotals; barcodeError: string | null; error: string | null }>;
  syncFbrConfig: (mode?: "auto" | "full") => Promise<{ success: boolean; state: { serviceFee: number }; error: string | null }>;
  getFbrSyncState: () => Promise<{ itemCount: number; serviceFee: number; lastSynced: string | null; ready: boolean }>;
  getCatalogTotals: () => Promise<CatalogTotals>;
  searchCatalog: (query: string) => Promise<CatalogSearchResult[]>;
  onCatalogProgress: (callback: (message: string) => void) => void;
  lookupCatalog: (query: string) => Promise<{ exact: CatalogSearchResult | null; results: CatalogSearchResult[] }>;
  loadCart: () => Promise<{ cartKey: string; lines: CartLine[] }>;
  saveCart: (lines: CartLine[]) => Promise<void>;
  syncCustomers: (mode?: "auto" | "full") => Promise<{ success: boolean; state: {count:number;lastSynced:string|null}; error:string|null }>;
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
  submitSale: (input: Record<string,unknown>) => Promise<{success:boolean;response:Record<string,unknown>|null;error:string|null;queued?:boolean}>;
  queueSale: (input: Record<string,unknown>) => Promise<{success:boolean;response:Record<string,unknown>|null;error:string|null;queued:boolean}>;
  syncSaleQueue: () => Promise<{synced:number;failed:number;remaining:number;error:string|null}>;
  getQueueStatus: () => Promise<{queued:number;failed:number}>;
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
  getInvoiceForRefund: (invoiceName: string) => Promise<{ data: Record<string, unknown> | null; error: string | null }>;
  submitPosRefund: (input: Record<string, unknown>) => Promise<{ result: Record<string, unknown> | null; error: string | null }>;
  getShiftSummary: (openingEntry?: string) => Promise<{ success: boolean; summary: ShiftSummary | null; error: string | null }>;
  closeShift: (input: Record<string, unknown>) => Promise<{ success: boolean; closingEntry: string; response: Record<string, unknown> | null; error: string | null }>;
  listShiftHistory: () => Promise<ShiftHistoryRow[]>;
  getShiftHistory: (openingEntry: string) => Promise<ShiftHistoryRow | null>;
  getAppVersion: () => Promise<string>;
  checkForUpdate: () => Promise<{ ok: boolean; error: string | null }>;
  downloadUpdate: () => Promise<{ ok: boolean; error: string | null }>;
  installUpdate: () => Promise<void>;
  saveUpdateToken: (token: string) => Promise<{ ok: boolean }>;
  isUpdateTokenSet: () => Promise<boolean>;
  onUpdateStatus: (callback: (payload: Record<string, unknown>) => void) => void;
  listReleases: () => Promise<{ releases: ReleaseEntry[]; error: string | null }>;
  installRelease: (input: Record<string, unknown>) => Promise<{ ok: boolean; error: string | null }>;
  getAdminPinStatus: () => Promise<{ configured: boolean; locked: boolean; secondsRemaining: number; failedAttempts: number }>;
  verifyAdminPin: (pin: string) => Promise<{ ok: boolean; error: string | null; locked?: boolean; secondsRemaining?: number }>;
  authorizeAdminAction: (input: Record<string, unknown>) => Promise<{ ok: boolean; token: string; error: string | null }>;
  setAdminPin: (input: Record<string, unknown>) => Promise<{ ok: boolean; error: string | null }>;
}

interface ReleaseEntry { tag: string; version: string; name: string; notes: string; publishedAt: string; prerelease: boolean; exeName: string; exeUrl: string; exeApiUrl: string; }

interface ShiftPaymentRow { mode_of_payment: string; opening_amount: number; collected_amount: number; expected_amount: number; sale_amount?: number; refund_amount?: number; net_movement?: number; }
interface ShiftSummary { openingEntry: string; posProfile: string; user: string; company: string; periodStart: string; postingDate: string; status: string; payments: ShiftPaymentRow[]; invoiceCount: number; netSales: number; refunds: number; totalOpening: number; totalExpected: number; isEstimate: boolean; }
interface ShiftHistoryRow { openingEntry: string; closingEntry: string | null; posProfile: string; cashier: string; company: string; openedAt: string | null; closedAt: string | null; openingCash: number; expectedCash: number; actualCash: number; difference: number; netSales: number; status: string; summary: Record<string, unknown> | null; createdAt: string; }

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
interface CatalogSearchResult { itemCode: string; itemName: string; barcode: string | null; uom: string; conversionFactor: number; sellingPrice: number | null; currency: string | null; actualStock: number | null; warehouse: string | null; }
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
// Offline cold start: optimistically trust the cached open shift so offline checkout is allowed.
// A reconnect revalidation (revalidateLive) will correct this if the shift was actually closed.
async function seedSessionFromCache(): Promise<boolean> {
  let summary: PosSessionSummary;
  try { summary = await window.posAPI.getCachedPosSession(); } catch { return false; }
  const entry = summary.openingEntry || "";
  if (!entry || summary.sessionStatus !== "Open") { sessionHasEntry = Boolean(entry); return false; }
  sessionHasEntry = true;
  sessionState = {
    openingEntry: entry, status: "Open", user: summary.user || authenticatedUser,
    posProfile: document.querySelector<HTMLSelectElement>("#pos-profile")?.value || sessionState.posProfile,
    company: document.querySelector<HTMLElement>("#config-company")?.textContent || sessionState.company,
    postingDate: "", periodStart: summary.startDateTime || "", lastChecked: Date.now(), lastError: "", valid: true, reason: ""
  };
  applySessionToHeader(); renderSessionInfo(); updateCompleteSaleState();
  return true;
}
// Offline cold start: seed the POS Profile's default customer (online bootstrap normally does this) so checkout isn't blocked.
async function seedDefaultCustomerFromConfig(cfg: PosConfigurationSummary): Promise<void> {
  if (selectedCustomer || !cfg.defaultCustomer) return;
  const base = { name: cfg.defaultCustomer, customer_name: cfg.defaultCustomer, customer_group: "", mobile_no: "", email_id: "", tax_id: "" };
  selectedCustomer = base;
  try {
    const c = await window.posAPI.loadCustomer(cfg.defaultCustomer);
    if (c.customer) selectedCustomer = { ...base, customer_name: String(c.customer.customer_name ?? base.customer_name), customer_group: String(c.customer.customer_group ?? ""), mobile_no: String(c.customer.mobile_no ?? ""), email_id: String(c.customer.email_id ?? ""), tax_id: String(c.customer.tax_id ?? "") };
  } catch { /* offline: keep the cached default-customer base */ }
  showCustomer();
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
    row.textContent = `${result.itemCode} — ${result.itemName} | Barcode: ${result.barcode ?? "—"} | UOM: ${result.uom} x${result.conversionFactor ?? 1} | Price: ${result.sellingPrice ?? "—"} ${result.currency ?? ""} | Stock: ${result.actualStock ?? "—"} | Warehouse: ${result.warehouse ?? "—"}`;
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
let previewStatus: "idle" | "local" | "validating" | "validated" | "applied" | "error" | "offline" = "idle";
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
let receiptMode: "sale" | "history" | "refund" = "sale";     // sale = just submitted; history = duplicate/view; refund = return receipt
let receiptAutoPrintPending = false;
let receiptAutoPrintDone = false;
// --- Refund state ---
let refundData: Record<string, unknown> | null = null;       // server get_pos_invoice_for_refund payload
let refundTerminalId = "";                                   // persistent terminal_refund_id for the current refund operation
let refundSubmitting = false;
let paymentMethods: string[] = [];
let selectedPaymentMethodIndex = 0;
let paymentRows: PaymentRow[] = [];
let paymentsOutdated = false;
let prevServerConnected = false;
// --- POS session health ---
interface SessionState { openingEntry: string; status: string; user: string; posProfile: string; company: string; postingDate: string; periodStart: string; lastChecked: number; lastError: string; valid: boolean; reason: string; }
let sessionState: SessionState = { openingEntry: "", status: "", user: "", posProfile: "", company: "", postingDate: "", periodStart: "", lastChecked: 0, lastError: "", valid: false, reason: "Not checked" };
let authenticatedUser = "";
let sessionHasEntry = false;        // an opening entry was returned (even if invalid) — distinguishes "closed/mismatch" from "no shift"
let pendingSwitchEntry = "";        // a different active opening entry awaiting explicit confirmation to switch
let sessionCheckInFlight: Promise<boolean> | null = null;
let paymentEditIndex: number | null = null;
let terminalInvoiceId = "";
let submissionInProgress = false;
let startShiftInFlight = false;
let closeShiftInFlight = false;
let shiftClosed = false;          // set after a successful Close Shift; blocks F6/F9 until a new shift is started
let queueSyncInFlight = false;    // guards overlapping offline-queue sync runs
let appliedBenefits: AppliedBenefits = { loyaltyPoints: 0, couponCode: "" };
let customerBenefits = { loyaltyProgram: "", availablePoints: 0, conversionFactor: 1 };
let benefitsOutdated = false;
const slashSearchEnabled = true;
let scannerFocusUntil = 0;
let scannerFocusTimer: number | undefined;
function cartInput(): HTMLInputElement | null { return document.querySelector<HTMLInputElement>("#cart-search"); }
function shouldFocusScanner(): boolean {
  const input = cartInput();
  const posScreen = document.querySelector<HTMLElement>("#pos-screen");
  return Boolean(input && !input.disabled && !posScreen?.hidden && !document.querySelector<HTMLDialogElement>("dialog[open]"));
}
function isEditableElement(element: Element | null): boolean {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || Boolean(element?.closest("[contenteditable='true']"));
}
function isScannerTextKey(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.altKey && !event.metaKey && /^[a-zA-Z0-9]$/.test(event.key);
}
function captureScannerTextKey(event: KeyboardEvent): boolean {
  if (!isScannerTextKey(event) || !shouldFocusScanner() || isEditableElement(document.activeElement)) return false;
  const input = cartInput();
  if (!input) return false;
  event.preventDefault();
  event.stopPropagation();
  applyScannerFocus();
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${event.key}${input.value.slice(end)}`;
  const next = start + event.key.length;
  input.setSelectionRange(next, next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
function applyScannerFocus(): boolean {
  const input = cartInput();
  if (!input || !shouldFocusScanner()) return false;
  input.focus({ preventScroll: true });
  const end = input.value.length;
  input.setSelectionRange(end, end);
  return document.activeElement === input;
}
function focusCart(sticky = false, nativeFocus = false): void {
  if (sticky) scannerFocusUntil = Date.now() + 800;
  if (nativeFocus) void window.posAPI.focusPosWindow();
  const tick = (): void => {
    const focused = applyScannerFocus();
    if (scannerFocusTimer !== undefined) {
      window.clearTimeout(scannerFocusTimer);
      scannerFocusTimer = undefined;
    }
    if ((!focused || Date.now() < scannerFocusUntil) && shouldFocusScanner()) {
      scannerFocusTimer = window.setTimeout(tick, 40);
    }
  };
  window.setTimeout(tick, 0);
  window.requestAnimationFrame(tick);
}
function cartMessage(message: string): void { const e = document.querySelector<HTMLElement>("#cart-message"); if (e) e.textContent = message; }
function clearCartSearch(): void { cartSearchResults = []; selectedSearchIndex = 0; const input = cartInput(); if (input) input.value = ""; document.querySelector<HTMLElement>("#cart-search-results")?.replaceChildren(); }
type PosScreen = "pos" | "settings" | "start-shift" | "close-shift" | "shift-history" | "held-sales" | "sales-history" | "refund";
const screenIds: Record<PosScreen, string> = { pos: "#pos-screen", settings: "#settings-screen", "start-shift": "#start-shift-screen", "close-shift": "#close-shift-screen", "shift-history": "#shift-history-screen", "held-sales": "#held-sales-screen", "sales-history": "#sales-history-screen", refund: "#refund-screen" };
// Switches the visible view without touching cart/customer/payment state.
function showScreen(screen: PosScreen): void {
  for (const [key, selector] of Object.entries(screenIds)) { const el = document.querySelector<HTMLElement>(selector); if (el) el.hidden = key !== screen; }
  if (screen === "pos") focusCart(true);
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
function fmtMoney(value: number): string { return money2(value).toFixed(2); }
function setText(id: string, value: string): void { const e = document.querySelector<HTMLElement>(id); if (e) e.textContent = value || "—"; }

// --- Offline sale queue UI ---------------------------------------------------
// Reflect connectivity + pending-queue count in the header badge and the OFFLINE banner.
async function updateOfflineUi(): Promise<void> {
  const online = isOnline();
  let counts = { queued: 0, failed: 0 };
  try { counts = await window.posAPI.getQueueStatus(); } catch { /* DB not ready — leave zeros */ }
  const queueEl = document.querySelector<HTMLElement>("#pos-queue-status");
  if (queueEl) { queueEl.textContent = counts.queued > 0 ? `${counts.queued} pending` : (online ? "Synced" : "—"); queueEl.className = counts.queued > 0 ? "queue-pending" : ""; }
  const banner = document.querySelector<HTMLElement>("#pos-offline-banner");
  const text = document.querySelector<HTMLElement>("#pos-offline-text");
  const show = !online || counts.queued > 0;
  if (banner) banner.hidden = !show;
  if (text) text.textContent = !online
    ? `OFFLINE — sales complete on local FBR estimates and queue automatically${counts.queued ? ` (${counts.queued} pending)` : ""}. They post to FBR when the server returns.`
    : counts.queued ? `Back online — ${counts.queued} queued sale(s) pending sync.` : "";
  const syncBtn = document.querySelector<HTMLButtonElement>("#pos-sync-queue");
  if (syncBtn) syncBtn.disabled = !online || counts.queued === 0;
}
// Replay the offline queue to the server. Called on reconnect and from the manual "Sync Now" button.
async function syncQueueNow(manual = false): Promise<void> {
  if (!isOnline()) { if (manual) cartMessage("Still offline — queued sales will sync when the server returns."); return; }
  if (queueSyncInFlight) return;
  queueSyncInFlight = true;
  try {
    const r = await window.posAPI.syncSaleQueue();
    if (manual || r.synced || r.failed) cartMessage(`Queue sync: ${r.synced} synced${r.failed ? `, ${r.failed} failed` : ""}${r.remaining ? `, ${r.remaining} remaining` : ""}.`);
  } catch { if (manual) cartMessage("Queue sync failed — will retry on next reconnect."); }
  finally { queueSyncInFlight = false; await updateOfflineUi(); }
}

// --- Start Shift -------------------------------------------------------------
function updateOpeningTotal(): void {
  const total = [...document.querySelectorAll<HTMLInputElement>("#shift-opening-amounts input")].reduce((sum, input) => sum + (Number(input.value) || 0), 0);
  setText("#shift-opening-total", fmtMoney(total));
}
async function showStartShift(): Promise<void> {
  const online = isOnline();
  const dot = document.querySelector<HTMLElement>("#start-shift-online");
  if (dot) { dot.textContent = online ? "Online" : "Offline"; dot.className = `online-dot ${online ? "online" : "offline"}`; }
  setText("#shift-cashier", document.querySelector<HTMLElement>("#pos-cashier")?.textContent ?? authenticatedUser ?? "");
  setText("#shift-company", document.querySelector<HTMLElement>("#config-company")?.textContent ?? "");
  setText("#shift-branch", document.querySelector<HTMLInputElement>("#branch")?.value ?? "");
  setText("#shift-profile", document.querySelector<HTMLSelectElement>("#pos-profile")?.value ?? "");
  setText("#shift-warehouse", document.querySelector<HTMLInputElement>("#warehouse")?.value ?? document.querySelector<HTMLElement>("#config-warehouse")?.textContent ?? "");
  setText("#shift-terminal", document.querySelector<HTMLInputElement>("#terminal-id")?.value ?? "");
  setText("#shift-datetime", new Date().toLocaleString());
  const message = document.querySelector<HTMLElement>("#start-shift-message");
  const box = document.querySelector<HTMLElement>("#shift-opening-amounts");
  const modes = await window.posAPI.getPaymentMethods();
  if (!modes.length) { if (message) message.textContent = "No payment methods loaded from POS Profile — run Force Full POS Configuration Sync in Settings."; if (box) box.replaceChildren(); }
  else {
    if (message) message.textContent = "";
    if (box) box.replaceChildren(...modes.map((mode) => {
      const row = document.createElement("div"); row.className = "shift-balance-row";
      const label = document.createElement("span"); label.textContent = mode;
      const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.step = "0.01"; input.dataset.mode = mode; input.value = "0";
      input.addEventListener("input", updateOpeningTotal);
      row.append(label, input); return row;
    }));
  }
  updateOpeningTotal();
  showScreen("start-shift");
}
async function startShift(): Promise<void> {
  const message = document.querySelector<HTMLElement>("#start-shift-message");
  const button = document.querySelector<HTMLButtonElement>("#start-shift");
  if (startShiftInFlight) return;                                          // prevent duplicate submission
  if (!isOnline()) { if (message) message.textContent = "Online connection required to start shift"; return; }
  const balances = [...document.querySelectorAll<HTMLInputElement>("#shift-opening-amounts input")]
    .map((input) => ({ mode_of_payment: input.dataset.mode ?? "", opening_amount: Number(input.value) || 0 }))
    .filter((row) => Boolean(row.mode_of_payment));
  if (!balances.length) { if (message) message.textContent = "No payment methods loaded from POS Profile"; return; }
  startShiftInFlight = true;
  if (button) button.disabled = true;
  if (message) message.textContent = "Starting shift…";
  try {
    const result = await window.posAPI.startPosSession({ opening_balances: balances });
    if (!result.success || !result.session) { if (message) message.textContent = result.error ?? "Unable to start shift"; return; }
    const s = result.session;
    showPosSessionSummary({ sessionStatus: "Open", openingEntry: String(s.opening_entry ?? s.name ?? ""), user: String(s.user ?? ""), startDateTime: String(s.period_start_date ?? s.creation ?? ""), openingBalanceRowsCount: Array.isArray(s.balance_details) ? s.balance_details.length : 0, lastSynced: new Date().toISOString() });
    // Server cached/returned the active Opening Entry (idempotent — never creates a duplicate); re-validate then open POS.
    shiftClosed = false;
    sessionState.openingEntry = "";
    const ok = await validateSession("start-shift");
    updatePosHeader();
    if (ok) { if (message) message.textContent = ""; showScreen("pos"); }
    else if (message) message.textContent = sessionState.reason || "Session could not be validated after starting the shift.";
  } finally {
    startShiftInFlight = false;
    if (button) button.disabled = false;
  }
}

// Refresh Session from the Start Shift screen: adopt an already-active shift (if any) and jump to POS.
async function refreshFromStartShift(): Promise<void> {
  const message = document.querySelector<HTMLElement>("#start-shift-message");
  if (!isOnline()) { if (message) message.textContent = "Online connection required to refresh the session"; return; }
  if (message) message.textContent = "Refreshing session…";
  sessionState.openingEntry = "";
  const ok = await validateSession("start-shift-refresh");
  updatePosHeader();
  if (ok) { shiftClosed = false; if (message) message.textContent = ""; showScreen("pos"); }
  else { await showStartShift(); if (message) message.textContent = sessionState.reason || "No active POS Opening Entry found."; }
}

// --- Close Shift -------------------------------------------------------------
let closeShiftSummary: ShiftSummary | null = null;
function reconRows(): { mode: string; expected: number; opening: number; actual: number }[] {
  return [...document.querySelectorAll<HTMLElement>("#close-recon-rows .close-recon-row")].map((row) => ({
    mode: row.dataset.mode ?? "",
    opening: Number(row.dataset.opening) || 0,
    expected: Number(row.dataset.expected) || 0,
    actual: Number(row.querySelector<HTMLInputElement>("input")?.value) || 0
  }));
}
function updateCloseDifferences(): void {
  let totalDiff = 0;
  for (const row of document.querySelectorAll<HTMLElement>("#close-recon-rows .close-recon-row")) {
    const expected = Number(row.dataset.expected) || 0;
    const actual = Number(row.querySelector<HTMLInputElement>("input")?.value) || 0;
    const diff = money2(actual - expected); totalDiff += diff;
    const diffEl = row.querySelector<HTMLElement>(".recon-diff");
    if (diffEl) { diffEl.textContent = fmtMoney(diff); diffEl.className = `recon-diff ${Math.abs(diff) < 0.005 ? "balanced" : diff > 0 ? "over" : "short"}`; }
  }
  const totalEl = document.querySelector<HTMLElement>("#close-total-difference");
  if (totalEl) { totalEl.textContent = fmtMoney(totalDiff); totalEl.className = Math.abs(totalDiff) < 0.005 ? "balanced" : "warn"; }
}
// Thermal-receipt-width shift summary: opening, sales, refunds, actual, difference (+ per-mode difference).
function buildShiftSummaryHtml(): string {
  const s = closeShiftSummary;
  const rows = reconRows();
  const opening = rows.reduce((a, r) => a + r.opening, 0) || (s?.totalOpening ?? 0);
  const expected = rows.reduce((a, r) => a + r.expected, 0) || (s?.totalExpected ?? 0);
  const actual = rows.reduce((a, r) => a + r.actual, 0);
  const difference = money2(actual - expected);
  const sales = s?.netSales ?? 0;
  const refunds = s?.refunds ?? 0;
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
  const branch = document.querySelector<HTMLInputElement>("#branch")?.value ?? "";
  const cashier = s?.user || (document.querySelector<HTMLElement>("#pos-cashier")?.textContent ?? "—");
  const opened = s?.periodStart ? new Date(s.periodStart).toLocaleString() : "—";
  const line = (label: string, value: number, bold = false) => `<div style="display:flex;justify-content:space-between">${bold ? "<strong>" : ""}<span>${esc(label)}</span><span>${value.toFixed(2)}</span>${bold ? "</strong>" : ""}</div>`;
  const perMode = rows.map((r) => `<div style="display:flex;justify-content:space-between"><span>${esc(r.mode)}</span><span>${money2(r.actual - r.expected).toFixed(2)}</span></div>`).join("");
  return `<div style="font:12px/1.5 monospace;width:280px;padding:8px">
    <div style="text-align:center"><strong>${esc(branch || "POS")}</strong><br/>SHIFT SUMMARY</div>
    <hr/>
    <div>Opening Entry: ${esc(s?.openingEntry ?? "—")}</div>
    <div>Cashier: ${esc(cashier)}</div>
    <div>POS Profile: ${esc(s?.posProfile ?? "—")}</div>
    <div>Opened: ${esc(opened)}</div>
    <div>Printed: ${new Date().toLocaleString()}</div>
    <hr/>
    ${line("Opening", opening)}
    ${line("Sales", sales)}
    ${line("Refunds", refunds)}
    ${line("Expected", expected)}
    ${line("Actual (counted)", actual)}
    ${line("Difference", difference, true)}
    <hr/>
    <div style="text-align:center;font-size:11px">Difference by mode</div>
    ${perMode}
    ${s?.isEstimate ? '<hr/><div style="text-align:center;font-size:10px">Local estimate — server is authoritative</div>' : ""}
  </div>`;
}
async function printShiftSummary(): Promise<void> {
  const message = document.querySelector<HTMLElement>("#close-shift-message");
  if (!closeShiftSummary) { if (message) message.textContent = "Open Close Shift first to load the summary."; return; }
  const result = await window.posAPI.printReceipt(buildShiftSummaryHtml());
  if (message) message.textContent = result.success ? "Shift summary sent to printer." : `Print failed: ${result.error ?? "Unknown error"}`;
}

async function showCloseShift(): Promise<void> {
  const message = document.querySelector<HTMLElement>("#close-shift-message");
  if (!isOnline()) { if (message) message.textContent = "Online connection required to close shift"; showSessionInvalid("Server is offline"); return; }
  // Validate there is an active shift before opening the form.
  if (!(await validateSession("close-shift"))) { showScreen("pos"); showSessionInvalid(sessionState.reason); return; }
  if (txnInProgress()) { showScreen("pos"); if (message) message.textContent = ""; cartMessage("Finish or hold the current sale/payment before closing the shift."); return; }
  // Drain any queued offline sales first so expected totals (server POS Invoices) include them.
  await syncQueueNow();
  const queue = await window.posAPI.getQueueStatus().catch(() => ({ queued: 0, failed: 0 }));
  const result = await window.posAPI.getShiftSummary(sessionState.openingEntry);
  if (!result.success || !result.summary) { showScreen("pos"); cartMessage(result.error ?? "Unable to load shift summary"); return; }
  closeShiftSummary = result.summary;
  const s = result.summary;
  setText("#close-opening-entry", s.openingEntry);
  setText("#close-cashier", s.user);
  setText("#close-profile", s.posProfile);
  setText("#close-opened-at", s.periodStart ? new Date(s.periodStart).toLocaleString() : "—");
  setText("#close-invoice-count", String(s.invoiceCount));
  setText("#close-net-sales", fmtMoney(s.netSales));
  const note = document.querySelector<HTMLElement>("#close-estimate-note"); if (note) note.hidden = !s.isEstimate;
  const heldCount = await window.posAPI.listHeldSales().then((rows) => rows.length).catch(() => 0);
  if (message) message.textContent = queue.queued > 0
    ? `Warning: ${queue.queued} offline sale(s) could not be synced and are NOT included in expected totals. Sync the queue before closing if possible.`
    : `Review counted amounts carefully. Submit Close Shift will create the ERPNext POS Closing Entry, close this shift, print the summary, delete ${heldCount} held sale(s), and require a new shift before selling again.`;
  const box = document.querySelector<HTMLElement>("#close-recon-rows");
  if (box) box.replaceChildren(...s.payments.map((p) => {
    const row = document.createElement("div"); row.className = "close-recon-row";
    row.dataset.mode = p.mode_of_payment; row.dataset.opening = String(p.opening_amount); row.dataset.expected = String(p.expected_amount);
    const mode = document.createElement("span"); mode.textContent = p.mode_of_payment;
    const opening = document.createElement("span"); opening.textContent = fmtMoney(p.opening_amount);
    const sales = document.createElement("span"); sales.textContent = fmtMoney(p.sale_amount ?? Math.max(p.collected_amount, 0));
    const refunds = document.createElement("span"); refunds.textContent = fmtMoney(p.refund_amount ?? Math.min(p.collected_amount, 0));
    const net = document.createElement("span"); net.textContent = fmtMoney(p.net_movement ?? p.collected_amount);
    const expected = document.createElement("span"); expected.textContent = fmtMoney(p.expected_amount);
    const actualWrap = document.createElement("span");
    const input = document.createElement("input"); input.type = "number"; input.step = "0.01"; input.value = fmtMoney(p.expected_amount);
    input.addEventListener("input", updateCloseDifferences); actualWrap.append(input);
    const diff = document.createElement("span"); diff.className = "recon-diff balanced"; diff.textContent = "0.00";
    row.append(mode, opening, sales, refunds, net, expected, actualWrap, diff); return row;
  }));
  updateCloseDifferences();
  showScreen("close-shift");
}
async function submitCloseShift(): Promise<void> {
  const message = document.querySelector<HTMLElement>("#close-shift-message");
  const button = document.querySelector<HTMLButtonElement>("#close-shift-submit");
  if (closeShiftInFlight) return;
  if (!isOnline()) { if (message) message.textContent = "Online connection required to close shift"; return; }
  if (!closeShiftSummary) { if (message) message.textContent = "Shift summary not loaded"; return; }
  // Re-validate the session immediately before submitting.
  if (!(await validateSession("close-submit"))) { if (message) message.textContent = sessionState.reason || "POS session is no longer active"; return; }
  const rows = reconRows();
  const totalDiff = rows.reduce((sum, r) => sum + (r.actual - r.expected), 0);
  const heldCount = await window.posAPI.listHeldSales().then((rows) => rows.length).catch(() => 0);
  if (!confirm(`Close Shift will submit an ERPNext POS Closing Entry, mark this shift closed, print the shift summary, delete ${heldCount} held sale(s), and block new sales until a new shift is opened. Continue?`)) return;
  if (Math.abs(totalDiff) >= 0.005 && !confirm(`There is a difference of ${fmtMoney(totalDiff)} between counted and expected amounts. Submit the closing entry anyway?`)) return;
  closeShiftInFlight = true;
  if (button) button.disabled = true;
  if (message) message.textContent = "Submitting closing entry…";
  try {
    const result = await window.posAPI.closeShift({
      opening_entry: closeShiftSummary.openingEntry,
      closing_balances: rows.map((r) => ({ mode_of_payment: r.mode, opening_amount: r.opening, expected_amount: r.expected, closing_amount: money2(r.actual), difference: money2(r.actual - r.expected) })),
      notes: document.querySelector<HTMLTextAreaElement>("#close-notes")?.value ?? ""
    });
    if (!result.success) { if (message) message.textContent = result.error ?? "Unable to close shift"; return; }
    if (message) message.textContent = "Shift closed. Printing summary...";
    await window.posAPI.printReceipt(buildShiftSummaryHtml());
    // Shift closed: mark closed locally, drop the cached entry, clear held drafts, preserve Sales History, block F6/F9, go to Start Shift.
    shiftClosed = true;
    closeShiftSummary = null;
    sessionState = { openingEntry: "", status: "Closed", user: "", posProfile: sessionState.posProfile, company: sessionState.company, postingDate: "", periodStart: "", lastChecked: Date.now(), lastError: "", valid: false, reason: "Shift closed" };
    showPosSessionSummary({ sessionStatus: "Not Open", openingEntry: "", user: "", startDateTime: "", openingBalanceRowsCount: 0, lastSynced: new Date().toISOString() });
    applySessionToHeader(); renderSessionInfo(); updateCompleteSaleState();
    if (message) message.textContent = `Shift closed${result.closingEntry ? ` — ${result.closingEntry}` : ""}.`;
    await showStartShift();
    const startMsg = document.querySelector<HTMLElement>("#start-shift-message");
    if (startMsg) startMsg.textContent = `Previous shift closed${result.closingEntry ? ` (${result.closingEntry})` : ""}. Start a new shift to continue.`;
  } finally {
    closeShiftInFlight = false;
    if (button) button.disabled = false;
  }
}

// --- Shift History -----------------------------------------------------------
async function openShiftHistory(): Promise<void> { showScreen("shift-history"); await renderShiftHistory(); }
async function renderShiftHistory(): Promise<void> {
  const message = document.querySelector<HTMLElement>("#shift-history-message");
  const list = document.querySelector<HTMLElement>("#shift-history-list");
  if (!list) return;
  let rows: ShiftHistoryRow[] = [];
  try { rows = await window.posAPI.listShiftHistory(); } catch { if (message) message.textContent = "Unable to load shift history"; }
  if (!rows.length) { if (message) message.textContent = ""; list.replaceChildren(Object.assign(document.createElement("div"), { className: "op-empty", textContent: "No closed shifts recorded on this terminal yet." })); return; }
  if (message) message.textContent = "";
  list.replaceChildren(...rows.map((r) => {
    const card = document.createElement("div"); card.className = "op-card shift-history-card";
    const main = document.createElement("div"); main.className = "op-card-main";
    const title = document.createElement("div"); title.className = "op-card-title"; title.textContent = `${r.openingEntry}${r.closingEntry ? ` → ${r.closingEntry}` : ""}`;
    const diffClass = Math.abs(r.difference) < 0.005 ? "balanced" : r.difference > 0 ? "over" : "short";
    const meta1 = document.createElement("div"); meta1.className = "op-card-meta"; meta1.textContent = `Cashier: ${r.cashier || "—"} · ${r.posProfile || "—"} · ${r.status}`;
    const meta2 = document.createElement("div"); meta2.className = "op-card-meta"; meta2.textContent = `Opened ${r.openedAt ? new Date(r.openedAt).toLocaleString() : "—"} · Closed ${r.closedAt ? new Date(r.closedAt).toLocaleString() : "—"}`;
    const meta3 = document.createElement("div"); meta3.className = "op-card-meta";
    meta3.append(`Opening ${fmtMoney(r.openingCash)} · Expected ${fmtMoney(r.expectedCash)} · Actual ${fmtMoney(r.actualCash)} · Net ${fmtMoney(r.netSales)} · Diff `);
    const diffSpan = document.createElement("strong"); diffSpan.className = `recon-diff ${diffClass}`; diffSpan.textContent = fmtMoney(r.difference); meta3.append(diffSpan);
    main.append(title, meta1, meta2, meta3);
    const actions = document.createElement("div"); actions.className = "op-card-actions";
    const view = document.createElement("button"); view.type = "button"; view.className = "secondary-button"; view.textContent = "View Summary"; view.onclick = () => showShiftHistorySummary(r);
    const print = document.createElement("button"); print.type = "button"; print.className = "secondary-button"; print.textContent = "Print Shift Report"; print.onclick = () => printShiftReport(r);
    actions.append(view, print);
    card.append(main, actions); return card;
  }));
}
function shiftReportText(r: ShiftHistoryRow): string {
  const summary = (r.summary?.summary ?? null) as ShiftSummary | null;
  const lines = [
    `Shift Report`, `Opening Entry: ${r.openingEntry}`, `Closing Entry: ${r.closingEntry ?? "—"}`,
    `Cashier: ${r.cashier || "—"}`, `POS Profile: ${r.posProfile || "—"}`, `Company: ${r.company || "—"}`,
    `Opened: ${r.openedAt ? new Date(r.openedAt).toLocaleString() : "—"}`, `Closed: ${r.closedAt ? new Date(r.closedAt).toLocaleString() : "—"}`,
    `Status: ${r.status}`, ``, `Mode               Opening   Expected   Actual   Difference`
  ];
  const closing = Array.isArray(r.summary?.closing_balances) ? r.summary!.closing_balances as Record<string, unknown>[] : [];
  const byMode = new Map(closing.map((c) => [String(c.mode_of_payment ?? ""), c]));
  for (const p of summary?.payments ?? []) {
    const c = byMode.get(p.mode_of_payment);
    const actual = c ? Number(c.closing_amount) || 0 : 0;
    lines.push(`${p.mode_of_payment.padEnd(18)} ${fmtMoney(p.opening_amount).padStart(8)} ${fmtMoney(p.expected_amount).padStart(9)} ${fmtMoney(actual).padStart(8)} ${fmtMoney(actual - p.expected_amount).padStart(11)}`);
  }
  lines.push(``, `Net Sales: ${fmtMoney(r.netSales)}`, `Cash Difference: ${fmtMoney(r.difference)}`);
  return lines.join("\n");
}
function showShiftHistorySummary(r: ShiftHistoryRow): void { alert(shiftReportText(r)); }
function printShiftReport(r: ShiftHistoryRow): void {
  const html = `<pre style="font:13px monospace;padding:16px;white-space:pre-wrap">${shiftReportText(r).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c))}</pre>`;
  void window.posAPI.printReceipt(html);
}
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
      items: cartLines.map((line) => ({ item_code: line.itemCode, uom: line.uom, qty: line.quantity, rate: line.sellingPrice ?? 0, conversion_factor: line.conversionFactor ?? 1 }))
    });
    if (version !== currentCartVersion) return; // a newer change superseded us
    const normalized = normalizeLocalFbrTotals(local);
    if (normalized) { localFbrTotals = normalized; serverTotals = { ...normalized }; }
  } catch { /* local FBR unavailable — fall through to server validation, keeping prior totals */ }
  // Offline: the local FBR engine is authoritative for checkout. Accept the cart as validated and skip the server round-trip.
  if (!isOnline()) {
    validatedCartVersion = version;
    previewStatus = "offline"; previewError = "";
    showPreviewStatus("Offline — Local FBR Estimate");
    renderServerTaxRows(); renderCart();
    return;
  }
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
  return shiftClosed?"Shift is closed — start a new shift"
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
  const online=isOnline();
  submissionInProgress=true;cartMessage(online?"Submitting Sale…":"Saving offline sale…");updateCompleteSaleState();
  // Submission payload unchanged; terminal_invoice_id is preserved across retries (only regenerated after Close & Start New Sale).
  const salePayload={terminal_invoice_id:terminalInvoiceId,terminal_id:terminal,pos_profile:profile,opening_entry:opening,customer:customer.name,items:cartLines.map(x=>({item_code:x.itemCode,qty:x.quantity,uom:x.uom,barcode:x.barcode??undefined})),payments:paymentRows.map(x=>({mode_of_payment:x.method,amount:x.amount})),coupon_code:appliedBenefits.couponCode,redeem_loyalty_points:appliedBenefits.loyaltyPoints>0,loyalty_points:appliedBenefits.loyaltyPoints,estimated_total:fbrTotalsView().payable};
  // Offline → queue locally with a provisional receipt; online → submit (a mid-submit drop auto-queues server-side).
  const result=online?await window.posAPI.submitSale(salePayload):await window.posAPI.queueSale(salePayload);
  submissionInProgress=false;
  const queued=Boolean(result.queued);
  if(!result.success||(!queued&&!result.response?.pos_invoice)){
    const submitError=result.error??"Missing POS Invoice";
    cartMessage(`Submission Failed: ${submitError}`);
    // The server can reject a still-"Open" entry as outdated/closed at submit time, even though
    // get_active_pos_session reported it active. Surface the Start Shift / refresh path (cart preserved).
    if(/outdated|opening entry|create a new pos opening|no open pos opening|opening shift|pos closing/i.test(submitError)){
      failSession(submitError);
      showSessionInvalid(submitError);
    }
    updateCompleteSaleState();
    return;
  }
  // Success: store authoritative (or provisional) response first, keep the cart, then open the receipt preview.
  lastSaleResponse=result.response;
  // Only after a confirmed successful submission/queue: remove the resumed held draft so it can't be resumed again.
  if(resumedHeldId!==null){try{await window.posAPI.deleteHeldSale(resumedHeldId);}catch{/* non-fatal: held draft cleanup */}resumedHeldId=null;}
  cartMessage(queued?"Sale saved offline — queued for FBR sync":"Sale Submitted");
  updateCompleteSaleState();
  await openReceiptPreview(result.response??{},queued);
  void updateOfflineUi();
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

async function openReceiptPreview(response:Record<string,unknown>,provisional=false):Promise<void>{
  receiptMode="sale";
  receiptAutoPrintPending=true;
  receiptAutoPrintDone=false;
  setCartText("#receipt-title",provisional?"Provisional Receipt — Offline (FBR Pending)":"Receipt Preview");
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
  if(provisional){
    // No server invoice yet — print a locally-built provisional slip; the real FBR receipt is available after sync.
    const msg=document.querySelector<HTMLElement>("#receipt-message");
    if(msg)msg.textContent="Offline — provisional receipt. This sale is queued and will post to FBR automatically when the server is back online.";
    lastReceiptHtml=buildLocalReceiptHtml(posInvoice);
    const printBtn=document.querySelector<HTMLButtonElement>("#receipt-print");if(printBtn)printBtn.disabled=false;
    const reprintBtn=document.querySelector<HTMLButtonElement>("#receipt-reprint");if(reprintBtn)reprintBtn.hidden=true;
    await autoPrintReceiptOnce();
    return;
  }
  await retrieveReceipt(posInvoice);
}

// Build a printable provisional receipt from local cart/totals/payments when there is no server-rendered receipt yet.
function receiptPrintCss():string{
  return `<style>
    @page{size:80mm auto;margin:2mm}
    @media print{html,body{width:80mm!important;margin:0!important;padding:0!important;background:#fff!important}button,input,select,textarea,.btn,.print-toolbar,.page-head,.navbar,#navbar,.web-footer,footer,.print-actions,a[href*="download_pdf"],a[href*="pdf"]{display:none!important}.receipt-item-row,.receipt-totals,.receipt-fbr,.receipt-footer,.rc-item,.rc-totals,.rc-fbr,.rc-footer{break-inside:avoid;page-break-inside:avoid}}
    *{box-sizing:border-box}body,.print-format,.pos-receipt{margin:0;padding:0;background:#fff!important;color:#000!important;font-family:Calibri,Arial,sans-serif!important;font-variant-numeric:tabular-nums}
    .print-format,.pos-receipt{width:80mm!important;max-width:80mm!important;margin:0 auto!important;padding:3mm 3mm 4mm!important;font-size:11px!important;line-height:1.35!important}
    .thermal-receipt{width:80mm;max-width:80mm;margin:0 auto;padding:3mm 3mm 4mm;color:#000;background:#fff;font:11px/1.35 Calibri,Arial,sans-serif}
    .receipt-company{font-size:18px;font-weight:800;text-align:center;color:#000}.receipt-title{font-size:15px;font-weight:800;text-align:center;border-top:1px solid #000;border-bottom:1px solid #000;margin:4px 0;padding:3px 0;color:#000}.receipt-label{font-size:15px;font-weight:900;text-align:center;border:2px solid #000;margin:0 0 5px;padding:5px;text-transform:uppercase;color:#000}
    .receipt-meta{font-size:11px;color:#000}.receipt-meta div,.receipt-total-row,.receipt-payment-row,.receipt-fbr-row{display:flex;justify-content:space-between;gap:8px}
    .receipt-items{width:100%;border-collapse:collapse;margin-top:4px;table-layout:fixed}.receipt-items th{font-size:10px;font-weight:800;color:#000;border-top:1px solid #000;border-bottom:1px solid #000;padding:3px 0;text-align:right}.receipt-items th:first-child{text-align:left}.receipt-items td{font-size:10px;font-weight:700;color:#000;padding:3px 0;text-align:right;vertical-align:top;border-bottom:1px dotted #999}.receipt-items td:first-child{font-size:11px;font-weight:800;text-align:left;white-space:normal;overflow-wrap:anywhere}.receipt-items .desc{width:auto}.receipt-items .qty{width:15mm}.receipt-items .rate{width:20mm}.receipt-items .amount{width:22mm}
    .receipt-totals{border-top:1px solid #000;margin-top:5px;padding-top:4px}.receipt-total-row{font-size:12px;font-weight:800;color:#000;margin:2px 0}.receipt-total-row.grand{font-size:16px;font-weight:900;border-top:2px solid #000;margin-top:4px;padding-top:4px}
    .receipt-payments{border:1px solid #000;margin-top:5px;padding:4px}.receipt-payment-title{font-size:10px;font-weight:900;text-transform:uppercase}.receipt-payment-row{font-size:11px;font-weight:700}
    .receipt-fbr{border:1px solid #000;margin-top:5px;padding:4px}.receipt-fbr-title{font-size:12px;font-weight:900;text-align:center}.receipt-fbr-row,.receipt-fbr-invoice{font-size:11px;font-weight:800;color:#000}.receipt-fbr-invoice{text-align:center;word-break:break-all;margin:4px 0}.receipt-footer{font-size:10px;font-weight:700;text-align:center;border-top:1px dashed #000;margin-top:6px;padding-top:5px;color:#000}
    .rc-company{font-size:18px!important;font-weight:800!important;color:#000!important}.rc-title{font-size:15px!important;font-weight:800!important;color:#000!important}.rc-meta,.rc-meta-row,.rc-fbr-row,.rc-fbr-inv{font-size:11px!important;color:#000!important;font-weight:700!important}
    .rc-meta-lbl,.rc-item-code,.rc-item-nums .c-desc,.rc-terms,.rc-footer{color:#000!important}.rc-col-hdr,.rc-item-nums{display:grid!important;grid-template-columns:minmax(0,1fr) 16mm 20mm 22mm!important;gap:1.5mm!important;color:#000!important}.rc-col-hdr{font-size:10px!important;font-weight:800!important}.rc-item-nums{font-size:10px!important;font-weight:700!important}
    .rc-item{padding:2px 1px!important;border-bottom:1px dotted #999!important}.rc-item-code{display:none!important}.rc-item-name{font-size:11px!important;font-weight:800!important;color:#000!important;overflow:visible!important;display:block!important;line-height:1.2!important}.rc-item-nums .c-num,.rc-col-hdr .c-num{text-align:right!important;white-space:nowrap!important}.rc-item-tax{margin-top:1px!important;padding:1px 2px!important;border-left:0!important;background:transparent!important;font-size:9.5px!important;line-height:1.15!important;color:#000!important;font-weight:800!important}.rc-item-tax-3rd,.rc-item-disc{display:none!important}
    .rc-tot-row{font-size:12px!important;color:#000!important;font-weight:700!important}.rc-tot-row.grand{font-size:16px!important;font-weight:900!important;color:#000!important}.rc-tot-amt{white-space:nowrap!important}.rc-fbr-title{font-size:12px!important;font-weight:900!important;color:#000!important}.rc-fbr-inv b,.rc-fbr-row span:last-child{font-weight:900!important;color:#000!important}.rc-footer{font-size:10px!important;color:#000!important}
    .rc-fbr-qr img,.receipt-qr-img{width:100px!important;height:100px!important;image-rendering:crisp-edges}.duplicate-copy,.return-copy{text-align:center!important;font:900 15px Calibri,Arial,sans-serif!important;border:2px solid #000!important;color:#000!important;background:#fff!important;padding:5px!important;margin:4px 0 6px!important;letter-spacing:1px!important;text-transform:uppercase!important}
  </style>`;
}
function buildLocalReceiptHtml(posInvoice:string):string{
  const totals=fbrTotalsView();
  const esc=(s:string)=>s.replace(/[&<>]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]??c));
  const cashier=document.querySelector<HTMLElement>("#pos-cashier")?.textContent??"-";
  const customer=selectedCustomer?(selectedCustomer.customer_name||selectedCustomer.name):"-";
  const branch=document.querySelector<HTMLInputElement>("#branch")?.value??"";
  const itemRows=cartLines.map(line=>`<tr class="receipt-item-row"><td>${esc(`${line.itemCode} - ${line.itemName}`)}</td><td>${line.quantity}</td><td>${(line.sellingPrice??0).toFixed(2)}</td><td>${((line.sellingPrice??0)*line.quantity).toFixed(2)}</td></tr>`).join("");
  const payRows=paymentRows.map(p=>`<div class="receipt-payment-row"><span>${esc(p.method)}</span><strong>${p.amount.toFixed(2)}</strong></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8">${receiptPrintCss()}</head><body>
    <div class="thermal-receipt">
      <div class="receipt-company">${esc(branch||"POS")}</div>
      <div class="receipt-label">PROVISIONAL - OFFLINE</div>
      <div class="receipt-title">POS INVOICE</div>
      <div class="receipt-meta">
        <div><span>Terminal Inv</span><strong>${esc(posInvoice||terminalInvoiceId)}</strong></div>
        <div><span>Date</span><strong>${new Date().toLocaleString()}</strong></div>
        <div><span>Cashier</span><strong>${esc(cashier)}</strong></div>
        <div><span>Customer</span><strong>${esc(customer)}</strong></div>
        <div><span>FBR Invoice</span><strong>PENDING</strong></div>
      </div>
      <table class="receipt-items">
        <thead><tr><th class="desc">Item</th><th class="qty">Qty</th><th class="rate">Rate</th><th class="amount">Amount</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="receipt-totals">
        <div class="receipt-total-row"><span>Sale Before Tax</span><strong>${totals.saleBeforeTax.toFixed(2)}</strong></div>
        <div class="receipt-total-row"><span>FBR Sales Tax</span><strong>${totals.salesTax.toFixed(2)}</strong></div>
        <div class="receipt-total-row"><span>FBR POS Service Fee</span><strong>${totals.serviceFee.toFixed(2)}</strong></div>
        <div class="receipt-total-row grand"><span>Grand Total</span><strong>${totals.payable.toFixed(2)}</strong></div>
      </div>
      <div class="receipt-payments">
        <div class="receipt-payment-title">Payment</div>
        ${payRows}
        <div class="receipt-payment-row"><span>Change</span><strong>${changeDue.toFixed(2)}</strong></div>
      </div>
      <div class="receipt-footer">Provisional slip - not an FBR tax invoice.<br>A valid FBR invoice prints after sync.</div>
    </div>
  </body></html>`;
}

function sanitizeReceiptHtml(html:string):string{
  const chromeSelector=".print-toolbar,.page-head,.navbar,#navbar,.web-footer,footer,.btn-print-preview,.print-preview-select,.print-preview-toolbar,.print-actions";
  try{
    const doc=new DOMParser().parseFromString(html,"text/html");
    doc.querySelectorAll(chromeSelector).forEach((el)=>el.remove());
    doc.querySelectorAll("a,button").forEach((el)=>{
      const text=(el.textContent||"").trim().toLowerCase();
      const href=el instanceof HTMLAnchorElement?el.href.toLowerCase():"";
      if(text==="print"||text==="get pdf"||text.includes("get pdf")||href.includes("download_pdf")||href.includes("pdf"))el.remove();
    });
    doc.head.insertAdjacentHTML("beforeend",receiptPrintCss());
    return `<!doctype html>${doc.documentElement.outerHTML}`;
  }catch{
    const css=receiptPrintCss();
    return /<\/head>/i.test(html)?html.replace(/<\/head>/i,`${css}</head>`):css+html;
  }
}

function decorateReceiptHtml(html:string):string{
  const title=document.querySelector<HTMLElement>("#receipt-title")?.textContent??"";
  if(!/^REFUND \/ RETURN/i.test(title))return html;
  const banner=`<div class="return-copy">${title}</div>`;
  return /<body[^>]*>/i.test(html)?html.replace(/(<body[^>]*>)/i,`$1${banner}`):banner+html;
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
      lastReceiptHtml=decorateReceiptHtml(sanitizeReceiptHtml(result.html));
      if(frame){frame.srcdoc=lastReceiptHtml;frame.hidden=false;}      // show the authoritative rendered receipt
      if(structured)structured.hidden=true;
      if(printBtn)printBtn.disabled=false;if(reprintBtn)reprintBtn.hidden=true;
      if(msg)msg.textContent=receiptAutoPrintPending?"Receipt ready. Printing automatically...":"Receipt ready to print.";
      await autoPrintReceiptOnce();
    }else{
      lastReceiptHtml=receiptMode==="sale"?buildLocalReceiptHtml(posInvoice):null;
      if(frame){frame.removeAttribute("srcdoc");frame.hidden=true;}
      if(structured)structured.hidden=false;                        // fall back to the structured summary
      if(printBtn)printBtn.disabled=lastReceiptHtml===null;if(reprintBtn)reprintBtn.hidden=false;
      if(msg)msg.textContent=lastReceiptHtml
        ? `Server receipt unavailable: ${result.error??"Unknown error"}. Local receipt is printable; server receipt can be reprinted after sync.`
        : `Receipt retrieval failed: ${result.error??"Unknown error"}. Sale is saved in Sales History.`;
      await autoPrintReceiptOnce();
    }
  }catch(error){
    lastReceiptHtml=receiptMode==="sale"?buildLocalReceiptHtml(posInvoice):null;
    if(frame){frame.removeAttribute("srcdoc");frame.hidden=true;}
    if(structured)structured.hidden=false;
    if(printBtn)printBtn.disabled=lastReceiptHtml===null;if(reprintBtn)reprintBtn.hidden=false;
    if(msg)msg.textContent=lastReceiptHtml
      ? `Server receipt unavailable: ${error instanceof Error?error.message:"Unknown error"}. Local receipt is printable; server receipt can be reprinted after sync.`
      : `Receipt retrieval failed: ${error instanceof Error?error.message:"Unknown error"}. Sale is saved in Sales History.`;
    await autoPrintReceiptOnce();
  }
}

async function autoPrintReceiptOnce():Promise<void>{
  if(!receiptAutoPrintPending||receiptAutoPrintDone||receiptMode!=="sale"||!lastReceiptHtml)return;
  receiptAutoPrintPending=false;
  receiptAutoPrintDone=true;
  const msg=document.querySelector<HTMLElement>("#receipt-message");
  if(msg)msg.textContent="Receipt ready. Printing automatically...";
  await printReceiptNow();
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
  if(receiptMode==="refund"){document.querySelector<HTMLDialogElement>("#receipt-dialog")?.close();await openSalesHistory();return;}
  await startNewSaleAfterReceipt();
}

// Electron does not support window.prompt(); use a small modal input instead. Listeners are added per-call and removed on close.
function promptName(title:string,label:string,defaultValue:string):Promise<string|null>{
  return new Promise((resolve)=>{
    const dialog=document.querySelector<HTMLDialogElement>("#name-dialog");
    const input=document.querySelector<HTMLInputElement>("#name-dialog-input");
    const form=document.querySelector<HTMLFormElement>("#name-form");
    const cancel=document.querySelector<HTMLButtonElement>("#name-dialog-cancel");
    setCartText("#name-dialog-title",title); setCartText("#name-dialog-label",label);
    if(!dialog||!input||!form){resolve(null);return;}
    input.value=defaultValue;
    const cleanup=()=>{form.removeEventListener("submit",onSubmit);cancel?.removeEventListener("click",onCancel);dialog.removeEventListener("cancel",onCancel);};
    const onSubmit=(e:Event)=>{e.preventDefault();const value=input.value.trim();cleanup();dialog.close();resolve(value||null);};
    const onCancel=(e?:Event)=>{e?.preventDefault();cleanup();dialog.close();resolve(null);};
    form.addEventListener("submit",onSubmit);
    cancel?.addEventListener("click",()=>onCancel());
    dialog.addEventListener("cancel",onCancel);
    dialog.showModal();window.setTimeout(()=>{input.focus();input.select();},0);
  });
}

// ---------------- Phase 3: Hold / Resume ----------------
async function holdCurrentSale():Promise<void>{
  if(!cartLines.length){cartMessage("Cart is empty — nothing to hold");return;}
  const totals=fbrTotalsView();
  const time=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  const customerName=selectedCustomer?(selectedCustomer.customer_name||selectedCustomer.name):"Walk-in";
  let count=1; try{count=(await window.posAPI.listHeldSales()).length+1;}catch{/* offline-safe */}
  const defaultName=`Hold ${String(count).padStart(3,"0")} — ${customerName} — ${time}`;
  const entered=await promptName("Hold Sale","Held sale name (optional)",defaultName);
  if(entered===null){cartMessage("Hold cancelled");return;}
  const name=entered.trim()||defaultName;
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
async function renameHeldSaleUi(id:number,current:string):Promise<void>{ const name=await promptName("Rename Held Sale","New name",current); if(!name||!name.trim())return; await window.posAPI.renameHeldSale(id,name.trim()); await renderHeldSales(); }
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
function todayDateInputValue():string{
  const d=new Date();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${d.getFullYear()}-${m}-${day}`;
}
async function openSalesHistory():Promise<void>{
  showScreen("sales-history");
  const search=document.querySelector<HTMLInputElement>("#history-search");
  const from=document.querySelector<HTMLInputElement>("#history-from");
  const to=document.querySelector<HTMLInputElement>("#history-to");
  if(!search?.value.trim()&&from&&!from.value)from.value=todayDateInputValue();
  if(!search?.value.trim()&&to&&!to.value)to.value=todayDateInputValue();
  await renderSalesHistory();
}
type RefundHistoryStatus = "unknown" | "none" | "partial" | "complete";
function classifyRefundHistory(data:Record<string,unknown>|null):RefundHistoryStatus{
  if(!data)return "unknown";
  const rows=Array.isArray(data.items)?data.items as Record<string,unknown>[]:[];
  if(!rows.length)return "unknown";
  const returned=rows.some((row)=>(previewNumber(row,"already_returned_qty")??0)>0);
  const remaining=rows.some((row)=>(previewNumber(row,"remaining_qty")??0)>0);
  if(returned&&!remaining)return "complete";
  if(returned&&remaining)return "partial";
  return "none";
}
async function loadRefundHistoryStatuses(rows:SalesHistoryRow[]):Promise<Map<string,RefundHistoryStatus>>{
  const statuses=new Map<string,RefundHistoryStatus>();
  if(!isOnline())return statuses;
  const invoices=[...new Set(rows.filter((row)=>row.posInvoice&&row.status==="Submitted").map((row)=>row.posInvoice as string))];
  await Promise.all(invoices.map(async(invoice)=>{
    const result=await window.posAPI.getInvoiceForRefund(invoice).catch(()=>({data:null,error:""}));
    statuses.set(invoice,classifyRefundHistory(result.data));
  }));
  return statuses;
}
async function renderSalesHistory():Promise<void>{
  const list=document.querySelector<HTMLElement>("#history-list"); const msg=document.querySelector<HTMLElement>("#history-message"); if(!list)return;
  const search=document.querySelector<HTMLInputElement>("#history-search")?.value.trim()??"";
  const fromInput=document.querySelector<HTMLInputElement>("#history-from");
  const toInput=document.querySelector<HTMLInputElement>("#history-to");
  if(!search&&fromInput&&!fromInput.value)fromInput.value=todayDateInputValue();
  if(!search&&toInput&&!toInput.value)toInput.value=todayDateInputValue();
  const from=search?"":fromInput?.value??"";
  const to=search?"":toInput?.value??"";
  if(msg)msg.textContent="Loading…";
  let rows:SalesHistoryRow[]=[];
  try{rows=await window.posAPI.listSalesHistory({search,dateFrom:from?`${from}T00:00:00.000Z`:"",dateTo:to?`${to}T23:59:59.999Z`:"",limit:50,offset:0});}
  catch{if(msg)msg.textContent="Unable to load sales history.";return;}
  if(msg)msg.textContent=isOnline()?"Checking refund status...":"";
  const refundStatuses=await loadRefundHistoryStatuses(rows);
  if(msg)msg.textContent="";
  if(!rows.length){list.replaceChildren(Object.assign(document.createElement("div"),{className:"op-empty",textContent:"No matching sales."}));return;}
  list.replaceChildren(...rows.map((row)=>{
    const response=row.response??{}; const payload=row.payload??{};
    const fbr=interpretFbr(response);
    const grand=previewNumber(response,"grand_total","rounded_total")??previewNumber(asTotalsRecord(payload),"grand_total")??0;
    const card=document.createElement("div");card.className="op-card";
    const main=document.createElement("div");main.className="op-card-main";
    const queued=row.status==="Queued";
    const estTotal=grand||previewNumber(asTotalsRecord(payload),"estimated_total")||previewNumber(response,"estimated_total")||0;
    const title=document.createElement("div");title.className="op-card-title";title.textContent=row.posInvoice||(queued?"Queued (offline)":"(no invoice)");
    const meta=document.createElement("div");meta.className="op-card-meta";
    meta.textContent=`${new Date(row.submittedAt||row.createdAt).toLocaleString()} · ${String(payload.customer??"—")} · ${estTotal?`Total ${estTotal.toFixed(2)}`:row.status} · Term ${row.terminalInvoiceId.slice(0,12)}… · Reprints ${row.reprintCount}`;
    const fbrTag=document.createElement("span");
    if(queued){fbrTag.className="fbr-tag return";fbrTag.textContent="Queued — Offline (FBR pending)";}
    else{fbrTag.className=`fbr-tag ${fbr.accepted?"ok":"warn"}`;fbrTag.textContent=`FBR ${fbr.accepted?"Accepted":fbr.statusText}${fbr.invoiceNumber?` · ${fbr.invoiceNumber}`:""}`;}
    main.append(title,meta,fbrTag);
    const refundStatus=row.posInvoice?refundStatuses.get(row.posInvoice):undefined;
    if(refundStatus==="partial"||refundStatus==="complete"){
      const refundTag=document.createElement("span");
      refundTag.className=`fbr-tag ${refundStatus==="complete"?"return":"warn"}`;
      refundTag.textContent=refundStatus==="complete"?"Completely refunded":"Partially refunded";
      main.append(refundTag);
    }
    const actions=document.createElement("div");actions.className="op-card-actions";
    const view=document.createElement("button");view.type="button";view.className="secondary-button";view.textContent="View Receipt";view.onclick=()=>void viewHistoryReceipt(row);
    const dup=document.createElement("button");dup.type="button";dup.textContent="Print Duplicate";dup.disabled=!row.posInvoice;dup.onclick=()=>void printDuplicate(row);
    const refund=document.createElement("button");refund.type="button";refund.className="secondary-button";refund.textContent=refundStatus==="complete"?"Refunded":"Refund";refund.disabled=!row.posInvoice||row.status!=="Submitted"||refundStatus==="complete";refund.onclick=()=>void openRefund(row.posInvoice??"");
    actions.append(view,dup,refund);
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

// ---------------- Phase F: Online Refund / Return ----------------
function refundItemRows():Record<string,unknown>[]{ return Array.isArray(refundData?.items)?(refundData!.items as Record<string,unknown>[]):[]; }
function refundHasRemaining(data:Record<string,unknown>|null=refundData):boolean{
  const rows=Array.isArray(data?.items)?data.items as Record<string,unknown>[]:[];
  return rows.some((row)=>(previewNumber(row,"remaining_qty")??0)>0);
}

// Entry point from Sales History (an original submitted sale). Loads authoritative data from the server.
async function openRefund(posInvoice:string):Promise<void>{
  if(!posInvoice){cartMessage("No invoice selected");return;}
  if(!isOnline()){const hm=document.querySelector<HTMLElement>("#history-message");if(hm)hm.textContent="Online connection required for refunds.";return;}
  const hm=document.querySelector<HTMLElement>("#history-message");if(hm)hm.textContent="Loading invoice…";
  const result=await window.posAPI.getInvoiceForRefund(posInvoice);
  if(!result.data){if(hm)hm.textContent=`Cannot open refund: ${result.error??"Unknown error"}`;return;}
  if(hm)hm.textContent="";
  refundData=result.data;
  refundTerminalId=crypto.randomUUID();  // one persistent id per refund operation (kept across retries)
  await renderRefundScreen();
  showScreen("refund");
}

async function renderRefundScreen():Promise<void>{
  if(!refundData)return;
  const d=refundData;
  const orig=document.querySelector<HTMLElement>("#refund-original");
  if(orig){const pair=(label:string,value:string)=>{const p=document.createElement("p");const a=document.createElement("span");a.textContent=label;const b=document.createElement("strong");b.textContent=value;p.append(a,b);return p;};
    orig.replaceChildren(
      pair("Original Invoice",String(d.original_invoice??"—")),
      pair("Posting",`${String(d.posting_date??"")} ${String(d.posting_time??"")}`),
      pair("Customer",String(d.customer_name??d.customer??"—")),
      pair("Original FBR #",String(d.fbr_invoice_number??"—")),
      pair("Original Grand Total",(previewNumber(d,"grand_total")??0).toFixed(2)),
      pair("Company",String(d.company??"—")));
  }
  const box=document.querySelector<HTMLElement>("#refund-items");
  if(box)box.replaceChildren(...refundItemRows().map((it)=>buildRefundRow(it)));
  const reason=document.querySelector<HTMLInputElement>("#refund-reason"); if(reason)reason.value="";
  const msg=document.querySelector<HTMLElement>("#refund-message"); if(msg)msg.textContent="";
  // Populate refund payment modes from the active POS Profile.
  const select=document.querySelector<HTMLSelectElement>("#refund-mode");
  if(select){const modes=await window.posAPI.getPaymentMethods();select.replaceChildren(...modes.map(m=>new Option(m,m)));const original=Array.isArray(d.payments)?d.payments:[];const firstMode=original.length?String((asTotalsRecord(original[0])??{}).mode_of_payment??""):"";if(firstMode&&modes.includes(firstMode))select.value=firstMode;}
  computeRefundTotal();
  const hasRemaining=refundHasRemaining();
  document.querySelector<HTMLButtonElement>("#refund-full")?.toggleAttribute("disabled",!hasRemaining);
  document.querySelector<HTMLButtonElement>("#refund-clear")?.toggleAttribute("disabled",!hasRemaining);
  document.querySelector<HTMLButtonElement>("#refund-submit")?.toggleAttribute("disabled",!hasRemaining);
  if(!hasRemaining&&msg)msg.textContent="This invoice is fully refunded. No refundable quantity remains.";
}

// --- Refund quantity helpers ---
function refundStep(input:HTMLInputElement):number{ return Number(input.dataset.step)||1; }
function refundRemaining(input:HTMLInputElement):number{ return Number(input.dataset.remaining)||0; }
function roundToStep(value:number, step:number):number{ return step>=1 ? Math.round(value) : Math.round(value*1000)/1000; }
function fmtQty(value:number, fractional:boolean):string{ return fractional ? value.toFixed(3) : String(Math.round(value)); }
function refundCellError(cell:Element|null, message:string):void{ const e=cell?.querySelector<HTMLElement>(".refund-error"); if(e){ if(message){ e.textContent=message; e.hidden=false; } else { e.textContent=""; e.hidden=true; } } }
// Step a row up/down by its UOM step, clamped to [0, remaining]. Never below 0, never above remaining.
function stepRefundQty(input:HTMLInputElement, direction:number):void{
  if(input.disabled) return;
  const step=refundStep(input), remaining=refundRemaining(input);
  let v=(Number(input.value)||0)+direction*step;
  v=roundToStep(Math.min(remaining, Math.max(0, v)), step);
  input.value=String(v);
  refundCellError(input.closest(".refund-qty-cell"), "");
  computeRefundTotal();
}
// Clamp/validate on BLUR only (not per keystroke) so typing + cursor stay stable. Shows an inline error when corrected.
function clampRefundInput(input:HTMLInputElement):void{
  const cell=input.closest(".refund-qty-cell");
  const remaining=refundRemaining(input), step=refundStep(input);
  const raw=input.value.trim();
  if(raw===""){ input.value="0"; refundCellError(cell,""); return; }
  const v=Number(raw);
  if(!Number.isFinite(v)||v<0){ input.value="0"; refundCellError(cell,"Invalid — reset to 0"); return; }
  if(v>remaining){ input.value=String(roundToStep(remaining,step)); refundCellError(cell,`Max refundable: ${fmtQty(remaining, step<1)}`); return; }
  input.value=String(roundToStep(v,step)); refundCellError(cell,"");
}

function buildRefundRow(it:Record<string,unknown>):HTMLElement{
  const sold=previewNumber(it,"sold_qty")??0;
  const alreadyReturned=previewNumber(it,"already_returned_qty")??0;
  const remaining=Math.max(0, previewNumber(it,"remaining_qty")??0);
  const rate=previewNumber(it,"rate")??0;
  const rowAmount=Math.abs(previewNumber(it,"amount")??0);
  const rowTax=Math.abs(previewNumber(it,"sales_tax")??0);
  const rowName=String(it.row_name??"");                 // preserve the original invoice child-row id
  const fractional=!Number.isInteger(sold)||!Number.isInteger(remaining);
  const step=fractional?0.001:1;                          // 1 for whole-number UOMs, 0.001 when fractional
  const refundable=remaining>0;                           // disable ONLY when nothing remains

  const container=document.createElement("div");container.className="refund-row";
  const text=(t:string)=>{const s=document.createElement("span");s.textContent=t;return s;};
  container.append(
    text(`${String(it.item_code??"")} — ${String(it.item_name??"")}`),
    text(fmtQty(sold,fractional)),
    text(fmtQty(alreadyReturned,fractional)),
    text(fmtQty(remaining,fractional)),
    text(rate.toFixed(2))
  );

  const qtyCell=document.createElement("span");qtyCell.className="refund-qty-cell";
  const controls=document.createElement("div");controls.className="refund-qty-controls";
  const minus=document.createElement("button");minus.type="button";minus.className="refund-step";minus.textContent="−";minus.tabIndex=-1;minus.disabled=!refundable;
  const plus=document.createElement("button");plus.type="button";plus.className="refund-step";plus.textContent="+";plus.tabIndex=-1;plus.disabled=!refundable;
  const input=document.createElement("input");
  input.type="number";input.className="refund-qty-input";input.value="0";
  input.min="0";input.max=String(remaining);input.step=String(step);
  input.dataset.rowName=rowName;input.dataset.remaining=String(remaining);input.dataset.rate=String(rate);input.dataset.step=String(step);input.dataset.sold=String(sold);input.dataset.rowAmount=String(rowAmount);input.dataset.rowTax=String(rowTax);
  input.disabled=!refundable;                             // never readonly; disabled only when remaining<=0
  minus.addEventListener("click",()=>stepRefundQty(input,-1));
  plus.addEventListener("click",()=>stepRefundQty(input,1));
  // Arrow keys step by UOM step (clamped); digits, decimal point, Backspace, Delete and selection stay native.
  input.addEventListener("keydown",(e)=>{ if(e.key==="ArrowUp"){ e.preventDefault(); stepRefundQty(input,1); } else if(e.key==="ArrowDown"){ e.preventDefault(); stepRefundQty(input,-1); } });
  input.addEventListener("input",()=>{ refundCellError(qtyCell,""); computeRefundTotal(); });   // no mid-type clamp
  input.addEventListener("blur",()=>{ clampRefundInput(input); computeRefundTotal(); });
  controls.append(minus,input,plus);
  const err=document.createElement("span");err.className="refund-error";err.hidden=true;
  qtyCell.append(controls,err);
  container.append(qtyCell);

  const est=document.createElement("span");est.className="refund-est";est.textContent="0.00";
  container.append(est);
  return container;
}

function computeRefundTotal():void{
  let total=0;let gst=0;
  document.querySelectorAll<HTMLInputElement>(".refund-qty-input").forEach((input)=>{
    const qty=Number(input.value)||0;const sold=Number(input.dataset.sold)||0;const rowAmount=Number(input.dataset.rowAmount)||0;const rowTax=Number(input.dataset.rowTax)||0;const ratio=sold>0?qty/sold:0;const est=qty>0?money2(rowAmount*ratio):0;const tax=qty>0?money2(rowTax*ratio):0;
    const estSpan=input.closest(".refund-row")?.querySelector<HTMLElement>(".refund-est");
    if(estSpan)estSpan.textContent=est.toFixed(2);
    total+=est;gst+=tax;
  });
  const fee=previewNumber(refundData??{},"fbr_pos_service_fee")??0;
  setCartText("#refund-merchandise",total.toFixed(2));
  setCartText("#refund-gst",gst.toFixed(2));
  setCartText("#refund-fbr-fee",fee.toFixed(2));
  setCartText("#refund-total",total.toFixed(2));
}

// Full Refund: every refundable row -> its remaining qty. Clear: every row -> 0.
function setRefundFull():void{ document.querySelectorAll<HTMLInputElement>(".refund-qty-input").forEach((input)=>{ if(input.disabled) return; input.value=String(roundToStep(refundRemaining(input),refundStep(input))); refundCellError(input.closest(".refund-qty-cell"),""); }); computeRefundTotal(); }
function clearRefundQty():void{ document.querySelectorAll<HTMLInputElement>(".refund-qty-input").forEach((input)=>{ input.value="0"; refundCellError(input.closest(".refund-qty-cell"),""); }); computeRefundTotal(); }

async function submitRefund():Promise<void>{
  if(refundSubmitting||!refundData)return;
  const msg=document.querySelector<HTMLElement>("#refund-message");
  if(!isOnline()){if(msg)msg.textContent="Online connection required to submit a refund.";return;}
  if(!(await validateSession("refund"))){if(msg)msg.textContent=sessionState.reason||"POS session is not active.";return;}
  // Clamp any value typed but not yet blurred, then collect selected rows (qty>0) by original row id.
  document.querySelectorAll<HTMLInputElement>(".refund-qty-input").forEach((input)=>clampRefundInput(input));
  const items:{original_row_name:string;qty:number}[]=[];
  document.querySelectorAll<HTMLInputElement>(".refund-qty-input").forEach((input)=>{const qty=Number(input.value)||0;if(qty>0&&input.dataset.rowName)items.push({original_row_name:input.dataset.rowName,qty});});
  if(!items.length){if(msg)msg.textContent="Enter at least one refund quantity.";return;}
  const mode=document.querySelector<HTMLSelectElement>("#refund-mode")?.value??"";
  if(!mode){if(msg)msg.textContent="Select a refund mode of payment.";return;}
  const reason=document.querySelector<HTMLInputElement>("#refund-reason")?.value??"";
  const btn=document.querySelector<HTMLButtonElement>("#refund-submit");if(btn)btn.disabled=true;
  // Re-fetch authoritative remaining quantities and block if another refund reduced availability.
  if(msg)msg.textContent="Verifying available quantities…";
  const fresh=await window.posAPI.getInvoiceForRefund(String(refundData.original_invoice??""));
  if(!fresh.data){if(msg)msg.textContent=`Unable to verify quantities: ${fresh.error??"Unknown error"}`;if(btn)btn.disabled=false;return;}
  const freshRemaining=new Map<string,number>();
  for(const raw of (Array.isArray(fresh.data.items)?fresh.data.items:[])){const r=asTotalsRecord(raw);if(r)freshRemaining.set(String(r.row_name??""),Math.max(0,previewNumber(r,"remaining_qty")??0));}
  const conflict=items.find((it)=>it.qty>(freshRemaining.get(it.original_row_name)??0)+1e-9);
  if(conflict){
    refundData=fresh.data;
    await renderRefundScreen();
    if(!refundHasRemaining(fresh.data)){
      if(msg)msg.textContent="This invoice is now fully refunded. Returning to Sales History.";
      window.setTimeout(()=>void openSalesHistory(),900);
    }else if(msg){
      msg.textContent="Available quantity changed (another refund may have processed). Quantities refreshed — re-check and submit again.";
    }
    if(btn)btn.disabled=!refundHasRemaining(fresh.data);
    return;
  }
  refundSubmitting=true;if(msg)msg.textContent="Submitting Refund…";
  // terminal_refund_id is NOT regenerated on retry — idempotency is server-enforced.
  const payload={terminal_refund_id:refundTerminalId,original_invoice:refundData.original_invoice,pos_opening_entry:sessionState.openingEntry,reason,items,payments:[{mode_of_payment:mode,amount:0}]};
  const result=await window.posAPI.submitPosRefund(payload);
  refundSubmitting=false;if(btn)btn.disabled=false;
  const res=result.result;
  if(!res||res.success!==true){if(msg)msg.textContent=`Refund failed: ${result.error??"Unknown error"}`;return;}
  if(msg)msg.textContent=res.duplicate?"Refund already existed (idempotent) — showing existing return.":"Refund submitted.";
  await showRefundReceipt(res);
}

async function showRefundReceipt(res:Record<string,unknown>):Promise<void>{
  receiptMode="refund"; // close returns to refreshed Sales History
  const invoice=asTotalsRecord(res.invoice)??{};
  const returnName=String(invoice.name??"");
  receiptInvoice=returnName;
  setCartText("#receipt-title",`REFUND / RETURN — ${returnName||"Unknown"}`);
  const printBtn=document.querySelector<HTMLButtonElement>("#receipt-print"); if(printBtn)printBtn.hidden=false;
  const dupBtn=document.querySelector<HTMLButtonElement>("#receipt-duplicate"); if(dupBtn)dupBtn.hidden=true;
  const closeBtn=document.querySelector<HTMLButtonElement>("#receipt-close"); if(closeBtn)closeBtn.textContent="Close";
  setCartText("#receipt-invoice",returnName||"—");
  setCartText("#receipt-posting",`${String(invoice.posting_date??"")} ${String(invoice.posting_time??"")}`);
  setCartText("#receipt-cashier",document.querySelector<HTMLElement>("#pos-cashier")?.textContent??"—");
  setCartText("#receipt-customer",String(invoice.customer??"—"));
  const items=Array.isArray(res.items)?res.items:[];
  const itemsBox=document.querySelector<HTMLElement>("#receipt-items");
  if(itemsBox)itemsBox.replaceChildren(...items.map((it)=>{const r=asTotalsRecord(it)??{};const div=document.createElement("div");div.className="receipt-item";[String(r.item_code??""),(previewNumber(r,"qty")??0).toFixed(3),(previewNumber(r,"rate")??0).toFixed(2),(previewNumber(r,"amount")??0).toFixed(2)].forEach(t=>{const s=document.createElement("span");s.textContent=t;div.append(s);});return div;}));
  const grand=previewNumber(invoice,"grand_total")??0;
  const refundTotals=asTotalsRecord(res.refund_totals)??{};
  setCartText("#receipt-before-tax",(previewNumber(refundTotals,"merchandise_refund")??Math.abs(grand)).toFixed(2));
  setCartText("#receipt-sales-tax",(previewNumber(refundTotals,"gst_refund")??0).toFixed(2));
  setCartText("#receipt-service-fee",`Not refunded ${(previewNumber(refundTotals,"non_refundable_fbr_pos_fee")??0).toFixed(2)}`);
  setCartText("#receipt-grand-total",grand.toFixed(2));
  const payments=Array.isArray(res.payments)?res.payments:[];
  const payBox=document.querySelector<HTMLElement>("#receipt-payments");
  if(payBox)payBox.replaceChildren(...payments.map((p)=>{const r=asTotalsRecord(p)??{};const el=document.createElement("p");const a=document.createElement("span");a.textContent=String(r.mode_of_payment??"");const b=document.createElement("strong");b.textContent=(previewNumber(r,"amount")??0).toFixed(2);el.append(a,b);return el;}));
  setCartText("#receipt-change","0.00");
  const fbr=asTotalsRecord(res.fbr)??{};
  const fbrStatus=String(fbr.status??"Pending");const fbrNumber=String(fbr.invoice_number??"");
  setCartText("#receipt-fbr-status",fbrStatus);setCartText("#receipt-fbr-number",fbrNumber||"—");
  const badge=document.querySelector<HTMLElement>("#receipt-fbr-badge");if(badge){const ok=fbrStatus==="Accepted";badge.textContent=`FBR ${fbrStatus}`;badge.className=`fbr-badge ${ok?"ok":"warn"}`;}
  const qrBox=document.querySelector<HTMLElement>("#receipt-qr");if(qrBox)qrBox.replaceChildren();
  lastReceiptHtml=null;
  const frame=document.querySelector<HTMLIFrameElement>("#receipt-frame");if(frame){frame.removeAttribute("srcdoc");frame.hidden=true;}
  const structured=document.querySelector<HTMLElement>("#receipt-structured");if(structured)structured.hidden=false;
  document.querySelector<HTMLDialogElement>("#receipt-dialog")?.showModal();
  if(returnName)await retrieveReceipt(returnName);
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
  if(shiftClosed){cartMessage("Shift is closed — start a new shift");return;}
  if(!cartLines.length){cartMessage("Cart is empty");return;}
  if(!(await validateSession("pay"))){showSessionInvalid(sessionState.reason);return;}
  if(validatedCartVersion!==currentCartVersion&&!activePreviewPromise)scheduleCartPreview();
  const pending=activePreviewPromise; // wait for the current validation if one is running
  if(pending){showPreviewStatus("Validating…");await pending;}
  if(validatedCartVersion!==currentCartVersion){cartMessage(previewError?`Cannot open payment — ${previewError}`:"Cart is not server validated yet");return;}
  if(paymentsOutdated&&paymentRows.length){if(!confirm("Cart changed. Clear outdated payments?"))return;paymentRows=[];await persistPayments();paymentsOutdated=false;}paymentMethods=await window.posAPI.getPaymentMethods();paymentRows=await window.posAPI.loadPaymentDraft();changeDue=0;selectedPaymentMethodIndex=0;renderPaymentMethods();const amountInput=document.querySelector<HTMLInputElement>("#payment-amount");if(amountInput)amountInput.value="";const payMsg=document.querySelector<HTMLElement>("#payment-message");if(payMsg)payMsg.textContent="";renderPayments();document.querySelector<HTMLDialogElement>("#payment-dialog")?.showModal();window.setTimeout(()=>amountInput?.focus(),0);}
function renderCart(): void {
  const container = document.querySelector<HTMLElement>("#cart-rows"); if (!container) return; container.replaceChildren();
  cartLines.forEach((line, index) => { const row = document.createElement("div"); row.setAttribute("role", "button"); row.tabIndex = -1; row.className = `cart-row${index === selectedCartIndex ? " selected" : ""}`; const cells = [line.itemCode,line.itemName,line.uom,String(line.quantity),String(line.sellingPrice ?? 0),"0.00",((line.sellingPrice ?? 0) * line.quantity).toFixed(2),`${line.actualStock ?? "—"}${line.actualStock !== null && line.quantity > line.actualStock ? " ⚠" : ""}`,"Void"]; cells.forEach((text) => { const cell=document.createElement("span");cell.textContent=text;row.append(cell); }); row.onpointerdown = (event) => event.preventDefault(); row.onclick = () => { selectedCartIndex = index; renderCart(); focusCart(true); }; container.append(row); });
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
async function afterCartMutation(message: string): Promise<void> {
  selectedCartIndex = cartLines.length ? Math.min(Math.max(selectedCartIndex, 0), cartLines.length - 1) : -1;
  clearCartSearch();
  paymentPreparedVersion = -1;
  if (cartLines.length) {
    if (paymentRows.length) paymentsOutdated = true;
  } else {
    paymentRows = [];
    paymentEditIndex = null;
    paymentsOutdated = false;
    changeDue = 0;
    appliedBenefits = { loyaltyPoints: 0, couponCode: "" };
    await persistPayments();
    await saveBenefitsDraft();
    renderPayments();
  }
  await persistCart();
  serverTotals = null;
  serverTaxRows = null;
  localFbrTotals = null;
  scheduleCartPreview();
  renderCart();
  cartMessage(message);
  focusCart(true, true);
}

async function addToCart(item: CatalogSearchResult): Promise<void> { const index = cartLines.findIndex((line) => line.itemCode === item.itemCode && line.uom === item.uom); let message = "Item added"; if (index >= 0) { cartLines[index].quantity += 1; selectedCartIndex = index; message = "Quantity changed"; } else { cartLines.push({ ...item, quantity: 1 }); selectedCartIndex = cartLines.length - 1; } await afterCartMutation(message); }

async function changeCartQuantity(delta: number): Promise<void> { if (selectedCartIndex < 0) return; cartLines[selectedCartIndex].quantity += delta; const voided = cartLines[selectedCartIndex].quantity <= 0; if (voided) cartLines.splice(selectedCartIndex, 1); await afterCartMutation(voided ? "Item voided" : "Quantity changed"); }

async function removeSelectedCartRow(): Promise<void> { if (selectedCartIndex < 0) return; cartLines.splice(selectedCartIndex, 1); await afterCartMutation("Item voided"); }
function editSelectedQuantity(): void { if (selectedCartIndex < 0) return; const dialog = document.querySelector<HTMLDialogElement>("#quantity-dialog"); const input = document.querySelector<HTMLInputElement>("#quantity-input"); if (!dialog || !input) return; input.value = String(cartLines[selectedCartIndex].quantity); dialog.showModal(); window.setTimeout(() => { input.focus(); input.select(); }, 0); }
async function saveDialogQuantity(): Promise<void> { const dialog = document.querySelector<HTMLDialogElement>("#quantity-dialog"); const input = document.querySelector<HTMLInputElement>("#quantity-input"); const quantity = Number(input?.value); if (!Number.isFinite(quantity) || quantity < 0 || selectedCartIndex < 0) { dialog?.close(); focusCart(); return; } const voided = quantity === 0; if (voided) cartLines.splice(selectedCartIndex, 1); else cartLines[selectedCartIndex].quantity = quantity; await afterCartMutation(voided ? "Item voided" : "Quantity changed"); dialog?.close(); }

function showCartSearchResults(results: CatalogSearchResult[], preserveSelection = false): void { cartSearchResults = results.slice(0, 7); if (!preserveSelection) selectedSearchIndex = 0; selectedSearchIndex = Math.min(selectedSearchIndex, Math.max(0, cartSearchResults.length - 1)); const container = document.querySelector<HTMLElement>("#cart-search-results"); if (!container) return; container.replaceChildren(...cartSearchResults.map((item, index) => { const button = document.createElement("button"); button.type="button"; button.className=`secondary-button search-result${index === selectedSearchIndex ? " selected" : ""}`; const price = item.sellingPrice === null ? "—" : `${item.sellingPrice.toFixed(2)} ${item.currency ?? ""}`; const stock = item.actualStock === null ? "—" : String(item.actualStock); button.innerHTML=`<span class="search-code">${item.itemCode}</span><span class="search-name">${item.itemName}</span><span class="search-meta">${item.uom} x${item.conversionFactor ?? 1} · ${price} · Stock ${stock}</span>`; button.onclick=()=>void addToCart(item); return button; })); container.querySelector<HTMLElement>(".selected")?.scrollIntoView({ block: "nearest" }); }
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
  sessionState.valid = false; sessionState.reason = reason; sessionState.lastError = reason; pendingSwitchEntry = switchEntry;
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
  const company = sessionStr(session, "company");
  const postingDate = sessionStr(session, "posting_date");
  const periodStart = sessionStr(session, "period_start_date", "posting_date", "creation");
  const selectedCompany = document.querySelector<HTMLElement>("#config-company")?.textContent || sessionState.company;
  if (!name) return failSession("Opening Entry name is missing");
  if (docstatus !== null && docstatus !== 1) return failSession("Opening Entry is not submitted (docstatus ≠ 1)");
  if (status !== "Open") return failSession(`Shift status is ${status}`);
  if (selectedProfile && profile && profile !== selectedProfile) return failSession(`Active shift uses POS Profile ${profile}, not ${selectedProfile}`);
  if (authenticatedUser && user && user !== authenticatedUser) return failSession(`Active shift belongs to ${user}`);
  if (selectedCompany && company && company !== selectedCompany) return failSession(`Active shift company ${company} does not match ${selectedCompany}`);
  if (sessionState.openingEntry && name !== sessionState.openingEntry) {
    // A different open entry is returned — never switch silently.
    if (cartLines.length) return failSession(`A different shift (${name}) is active. Confirm to switch.`, name);
    if (!confirm(`A different shift (${name}) is active. Switch to it?`)) return failSession(`A different shift (${name}) is active`, name);
  }
  sessionState = { openingEntry: name, status, user, posProfile: profile || selectedProfile, company: company || selectedCompany, postingDate, periodStart, lastChecked: Date.now(), lastError: "", valid: true, reason: "" };
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
  if (ok) {
    clearSessionInvalid(); showScreen("pos");
    // Changing the opening entry invalidates any prepared payment and requires re-validating the cart.
    if (paymentRows.length) paymentsOutdated = true;
    paymentPreparedVersion = -1;
    if (cartLines.length) scheduleCartPreview();
  }
}
async function goToPos(): Promise<void> {
  const ok = await validateSession("back-to-pos");
  if (ok) { clearSessionInvalid(); showScreen("pos"); }
  else if (!sessionHasEntry) { void showStartShift(); }
  else { showScreen("pos"); showSessionInvalid(sessionState.reason); }
}

// ===================== Startup bootstrap + background sync orchestration =====================
type SetupStepState = "pending" | "running" | "complete" | "warning" | "failed";
type SetupStep = "settings" | "server" | "auth" | "profile" | "config" | "session" | "catalogue" | "customers" | "fbr";
const ALL_STEPS: SetupStep[] = ["settings", "server", "auth", "profile", "config", "session", "catalogue", "customers", "fbr"];
let setupCompleted = false;             // becomes true after the first successful bootstrap (renames the primary button)
let bootstrapPromise: Promise<void> | null = null;

// Freshness windows (ms) — drive both startup refresh and the background scheduler.
const SYNC_FRESH = { items: 15 * 60_000, customers: 30 * 60_000, fbr: 12 * 3_600_000, config: 12 * 3_600_000 } as const;
type SyncKey = "items" | "customers" | "fbr" | "config";
const syncLocks: Record<SyncKey, boolean> = { items: false, customers: false, fbr: false, config: false };
let backgroundSyncStarted = false;

function setStep(step: SetupStep, state: SetupStepState): void { const li = document.querySelector<HTMLElement>(`#setup-progress li[data-step="${step}"]`); if (li) li.dataset.state = state; }
function setOverallBadge(text: string, kind: "ok" | "warn" | "err" | "info"): void { const badge = document.querySelector<HTMLElement>("#setup-overall-badge"); if (badge) { badge.textContent = text; badge.className = `status-badge ${kind}`; } }
function setOnlineIndicator(online: boolean): void { const el = document.querySelector<HTMLElement>("#setup-online-indicator"); if (el) { el.textContent = online ? "Online" : "Offline"; el.className = `online-dot ${online ? "online" : "offline"}`; } const primary = document.querySelector<HTMLButtonElement>("#complete-setup"); if (primary) primary.textContent = setupCompleted ? "Refresh Setup" : "Save and Complete Setup"; }
function setLoggedUser(user: string): void { setCartText("#setup-logged-user", user || "—"); }
function ageMs(iso: string | null | undefined): number { if (!iso) return Number.POSITIVE_INFINITY; const t = new Date(iso).getTime(); return Number.isNaN(t) ? Number.POSITIVE_INFINITY : Date.now() - t; }
function relativeTime(iso: string | null | undefined): string { if (!iso) return "never"; const ms = ageMs(iso); if (!Number.isFinite(ms)) return "never"; const min = Math.floor(ms / 60000); if (min < 1) return "just now"; if (min < 60) return `${min}m ago`; const h = Math.floor(min / 60); if (h < 24) return `${h}h ago`; return new Date(iso).toLocaleDateString(); }

// True while a sale/refund/payment is being finalised — background full-syncs must not run then.
function txnInProgress(): boolean { return submissionInProgress || refundSubmitting || Boolean(document.querySelector<HTMLDialogElement>("#payment-dialog")?.open); }

// One lock per dataset so a manual click and the scheduler never run the same sync twice.
async function runGuardedSync(key: SyncKey, run: () => Promise<void>): Promise<void> {
  if (syncLocks[key] || !isOnline()) return;
  syncLocks[key] = true; void renderSyncStatus();
  try { await run(); } catch { /* keep existing cache; row will show the stale/error state */ } finally { syncLocks[key] = false; void renderSyncStatus(); }
}
async function syncConfigNow(): Promise<void> { await runGuardedSync("config", async () => { const r = await window.posAPI.syncPosConfiguration(); if (r.summary) showPosConfigurationSummary(r.summary); }); }
// mode "auto" (default, used by the background scheduler) = delta when a watermark exists, full every 24h.
// mode "full" (manual "Force Full" buttons) = full DELETE+INSERT reconciliation. Decision lives in main.ts (it owns app_meta).
async function syncItemsNow(mode: "auto" | "full" = "auto"): Promise<void> { await runGuardedSync("items", async () => { const r = await window.posAPI.syncItemCatalog(mode); showCatalogTotals(r.totals); }); }
async function syncCustomersNow(mode: "auto" | "full" = "auto"): Promise<void> { await runGuardedSync("customers", async () => { await window.posAPI.syncCustomers(mode); }); }
async function syncFbrNow(mode: "auto" | "full" = "auto"): Promise<void> { await runGuardedSync("fbr", async () => { await window.posAPI.syncFbrConfig(mode); }); }

// Single background scheduler: triggers only datasets that are actually stale, never during a transaction.
// Staleness uses the unchanged SYNC_FRESH thresholds; "auto" mode then picks delta vs full (24h) inside main.ts.
async function backgroundSyncTick(): Promise<void> {
  if (!isOnline() || txnInProgress()) return;
  try {
    void syncQueueNow();
    const totals = await window.posAPI.getCatalogTotals(); if (ageMs(totals.lastSynced) > SYNC_FRESH.items) void syncItemsNow("auto");
    const cust = await window.posAPI.getCustomerSyncState(); if (ageMs(cust.lastSynced) > SYNC_FRESH.customers) void syncCustomersNow("auto");
    const fbr = await window.posAPI.getFbrSyncState(); if (ageMs(fbr.lastSynced) > SYNC_FRESH.fbr) void syncFbrNow("auto");
    const cfg = await window.posAPI.getCachedPosConfiguration(); if (!cfg || ageMs(cfg.lastSynced) > SYNC_FRESH.config) void syncConfigNow();
  } catch { /* ignore — next tick retries */ }
  void renderSyncStatus();
}
function startBackgroundSync(): void { if (backgroundSyncStarted) return; backgroundSyncStarted = true; void backgroundSyncTick(); window.setInterval(() => { void backgroundSyncTick(); }, 60_000); }

// --- App auto-update (electron-updater) UI ---------------------------------
function setupUpdateUi(): void {
  const statusEl = document.querySelector<HTMLElement>("#update-status");
  const checkBtn = document.querySelector<HTMLButtonElement>("#check-update");
  const dlBtn = document.querySelector<HTMLButtonElement>("#download-update");
  const installBtn = document.querySelector<HTMLButtonElement>("#install-update");
  const setStatus = (msg: string) => { if (statusEl) statusEl.textContent = msg; };
  window.posAPI.getAppVersion().then((v) => setText("#app-version", v)).catch(() => {/* ignore */});
  window.posAPI.isUpdateTokenSet().then((set) => setText("#update-token-status", set ? "A token is saved (private-repo mode)." : "No token saved (public repo).")).catch(() => {/* ignore */});

  window.posAPI.onUpdateStatus((p) => {
    const state = String(p.state ?? "");
    if (dlBtn) dlBtn.hidden = state !== "available";
    if (installBtn) installBtn.hidden = state !== "downloaded";
    if (checkBtn) checkBtn.disabled = state === "checking" || state === "downloading";
    switch (state) {
      case "checking": setStatus("Checking for updates…"); break;
      case "available": { setStatus(`Update available: v${String(p.version ?? "")}. Click Download Update.`); const n = document.querySelector<HTMLElement>("#update-notes"); const notes = String(p.notes ?? "").trim(); if (n) { n.hidden = !notes; n.textContent = notes; } break; }
      case "not-available": setStatus("You're on the latest version."); break;
      case "downloading": setStatus(`Downloading update… ${String(p.percent ?? 0)}%`); break;
      case "downloaded": setStatus(`Update v${String(p.version ?? "")} downloaded. Click Install & Restart.`); break;
      case "installing": setStatus("Installing update. The app will restart automatically..."); break;
      case "error": setStatus(`Update error: ${String(p.error ?? "unknown")}`); break;
      default: break;
    }
  });

  checkBtn?.addEventListener("click", async () => { setStatus("Checking for updates…"); const r = await window.posAPI.checkForUpdate(); if (!r.ok && r.error) setStatus(`Update check failed: ${r.error}`); });
  dlBtn?.addEventListener("click", async () => { setStatus("Starting download…"); if (dlBtn) dlBtn.disabled = true; const r = await window.posAPI.downloadUpdate(); if (dlBtn) dlBtn.disabled = false; if (!r.ok && r.error) setStatus(`Download failed: ${r.error}`); });
  installBtn?.addEventListener("click", () => { setStatus("Restarting to install…"); void window.posAPI.installUpdate(); });
  document.querySelector<HTMLButtonElement>("#save-update-token")?.addEventListener("click", async () => {
    if (!(await requireAdminPin("change_credentials", "Saving this token changes update credentials for private release downloads."))) return;
    const input = document.querySelector<HTMLInputElement>("#update-token");
    const token = input?.value.trim() ?? "";
    await window.posAPI.saveUpdateToken(token);
    if (input) input.value = "";
    setText("#update-token-status", token ? "Token saved (private-repo mode)." : "Token cleared (public repo).");
  });
  document.querySelector<HTMLButtonElement>("#show-releases")?.addEventListener("click", () => void renderReleasesList());
}

// Lists every published release so the admin can install (or roll back to) a specific version.
async function renderReleasesList(): Promise<void> {
  const box = document.querySelector<HTMLElement>("#releases-list");
  if (!box) return;
  const empty = (text: string) => box.replaceChildren(Object.assign(document.createElement("div"), { className: "op-empty", textContent: text }));
  empty("Loading releases…");
  const result = await window.posAPI.listReleases();
  if (result.error) { empty(`Unable to load releases: ${result.error}`); return; }
  if (!result.releases.length) { empty("No published releases found. Publish a release on GitHub first."); return; }
  const current = await window.posAPI.getAppVersion().catch(() => "");
  box.replaceChildren(...result.releases.map((rel) => {
    const card = document.createElement("div"); card.className = "op-card";
    const main = document.createElement("div"); main.className = "op-card-main";
    const title = document.createElement("div"); title.className = "op-card-title";
    title.textContent = `${rel.name}${rel.version === current ? " — installed" : ""}${rel.prerelease ? " · pre-release" : ""}`;
    const meta = document.createElement("div"); meta.className = "op-card-meta";
    meta.textContent = `v${rel.version}${rel.publishedAt ? ` · ${new Date(rel.publishedAt).toLocaleDateString()}` : ""}`;
    main.append(title, meta);
    if (rel.notes.trim()) { const notes = document.createElement("pre"); notes.className = "update-notes"; notes.textContent = rel.notes.trim(); main.append(notes); }
    const actions = document.createElement("div"); actions.className = "op-card-actions";
    const install = document.createElement("button"); install.type = "button";
    install.textContent = rel.version === current ? "Reinstall" : "Install this version";
    install.onclick = async () => {
      install.disabled = true; install.textContent = "Downloading…";
      const r = await window.posAPI.installRelease({ version: rel.version, exeName: rel.exeName, exeUrl: rel.exeUrl, exeApiUrl: rel.exeApiUrl });
      if (!r.ok) { install.disabled = false; install.textContent = "Retry"; setText("#update-status", `Install failed: ${r.error ?? "unknown"}`); }
    };
    actions.append(install);
    card.append(main, actions); return card;
  }));
}

function buildSyncRow(key: SyncKey, name: string, detail: string, lastSynced: string | null, retry: () => void): HTMLElement {
  const has = lastSynced != null;
  const state: SetupStepState = syncLocks[key] ? "running" : !has ? "pending" : ageMs(lastSynced) > SYNC_FRESH[key] ? "warning" : "complete";
  const icon = state === "running" ? "⟳" : state === "complete" ? "✓" : state === "warning" ? "!" : "•";
  const row = document.createElement("div"); row.className = "sync-row"; row.dataset.state = state;
  const main = document.createElement("div"); main.className = "sync-row-main";
  const title = document.createElement("div"); title.className = "sync-row-title"; title.textContent = `${icon} ${name}`;
  const meta = document.createElement("div"); meta.className = "sync-row-meta"; meta.textContent = `${detail || "—"} · ${syncLocks[key] ? "Syncing…" : has ? `Last synced ${relativeTime(lastSynced)}` : "Not synced"}`;
  main.append(title, meta);
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "secondary-button"; btn.textContent = state === "warning" ? "Refresh" : "Sync"; btn.disabled = syncLocks[key]; btn.onclick = retry;
  row.append(main, btn);
  return row;
}
async function renderSyncStatus(): Promise<void> {
  const box = document.querySelector<HTMLElement>("#sync-rows"); if (!box) return;
  const [totals, cust, fbr, cfg] = await Promise.all([
    window.posAPI.getCatalogTotals(), window.posAPI.getCustomerSyncState(), window.posAPI.getFbrSyncState(), window.posAPI.getCachedPosConfiguration()
  ]);
  box.replaceChildren(
    buildSyncRow("config", "POS Configuration", cfg ? `${cfg.taxRowsCount} tax rows · ${cfg.paymentMethodsCount} modes` : "no cache", cfg ? cfg.lastSynced : null, () => void syncConfigNow()),
    buildSyncRow("items", "Item Catalogue", `${totals.items} items · ${totals.barcodes} barcodes`, totals.lastSynced, () => void syncItemsNow()),
    buildSyncRow("customers", "Customers", `${cust.count} customers`, cust.lastSynced, () => void syncCustomersNow()),
    buildSyncRow("fbr", "FBR Configuration", `${fbr.itemCount} items · fee ${fbr.serviceFee}`, fbr.lastSynced, () => void syncFbrNow())
  );
}
async function markDataAvailabilityFromCache(): Promise<void> {
  const totals = await window.posAPI.getCatalogTotals(); setStep("catalogue", totals.items > 0 ? (ageMs(totals.lastSynced) > SYNC_FRESH.items ? "warning" : "complete") : "pending");
  const cust = await window.posAPI.getCustomerSyncState(); setStep("customers", cust.count > 0 ? (ageMs(cust.lastSynced) > SYNC_FRESH.customers ? "warning" : "complete") : "pending");
  const fbr = await window.posAPI.getFbrSyncState(); setStep("fbr", fbr.itemCount > 0 ? (ageMs(fbr.lastSynced) > SYNC_FRESH.fbr ? "warning" : "complete") : "pending");
}

// Single entry point for all startup/refresh flows. Reuses the in-flight promise to prevent duplicate chains.
function runPosBootstrap(reason: string): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = runStartup(reason).finally(() => { bootstrapPromise = null; });
  return bootstrapPromise;
}

async function runStartup(reason: string = "startup"): Promise<void> {
  void reason;
  const progress = document.querySelector<HTMLElement>("#startup-progress"); const retry = document.querySelector<HTMLButtonElement>("#retry-startup");
  const serverStatus = document.querySelector<HTMLElement>("#pos-server-status");
  ALL_STEPS.forEach((s) => setStep(s, "pending"));
  try {
    if (retry) retry.hidden = true;
    // 1) Settings
    setStep("settings", "running"); if (progress) progress.textContent = "Loading settings…";
    await loadSettingsIntoForm();
    const saved = await window.posAPI.loadSettings();
    if (!saved.erpnextUrl || !saved.apiKey || !saved.hasApiSecret || !saved.terminalId) {
      setStep("settings", "failed"); setOverallBadge("Setup Required", "warn");
      if (progress) progress.textContent = "Terminal settings required"; showSettingsMessage("Enter ERPNext URL, API Key/Secret and Terminal ID, then Save and Complete Setup."); showScreen("settings"); return;
    }
    setStep("settings", "complete");
    // 2) Server (silent)
    setStep("server", "running"); if (progress) progress.textContent = "Testing server…";
    const server = await window.posAPI.testServer(); setOnlineIndicator(server.connected);
    if (!server.connected) {
      setStep("server", "warning"); if (serverStatus) serverStatus.textContent = "Offline"; prevServerConnected = false; showServerStatus(false);
      // Offline but cached config exists -> open POS on cached data instead of forcing Settings.
      const cachedCfg = await window.posAPI.getCachedPosConfiguration();
      if (cachedCfg) {
        showPosConfigurationSummary(cachedCfg); await loadCachedPosSession(); updatePosHeader();
        await seedSessionFromCache();                              // allow offline checkout against the cached open shift
        await seedDefaultCustomerFromConfig(cachedCfg);            // default customer so the offline cart isn't "Missing Customer"
        ["config", "catalogue", "customers", "fbr", "session"].forEach((s) => setStep(s as SetupStep, "warning"));
        setOverallBadge("Ready Using Cached Data", "warn"); if (progress) progress.textContent = "Offline — using cached data";
        setupCompleted = true; void renderSyncStatus(); void updateOfflineUi(); showScreen("pos"); return;
      }
      setOverallBadge("Setup Required", "warn"); if (progress) progress.textContent = "Server not reachable"; showSettingsMessage("Server not reachable and no cached configuration. Check ERPNext URL / connection."); showScreen("settings"); return;
    }
    setStep("server", "complete"); if (serverStatus) serverStatus.textContent = "Online"; prevServerConnected = true; showServerStatus(true);
    // 3) Authenticate
    setStep("auth", "running"); if (progress) progress.textContent = "Authenticating…";
    const login = await window.posAPI.testLogin();
    if (!login.success) { setStep("auth", "failed"); setOverallBadge("Action Required", "err"); if (progress) progress.textContent = "Authentication failed"; showSettingsMessage("Authentication failed. The API key or secret is invalid."); showLoginResult("Authentication failed — check API Key/Secret."); showScreen("settings"); return; }
    authenticatedUser = login.loggedUser ?? ""; setStep("auth", "complete"); setLoggedUser(authenticatedUser); showLoginResult(`Logged in as ${authenticatedUser}`);
    // 4) Profiles + selected profile
    setStep("profile", "running"); if (progress) progress.textContent = "Loading POS Profile…";
    await populatePosProfileDropdown();
    const profile = await window.posAPI.loadPosProfile();
    if (!profile.success) { setStep("profile", "failed"); setOverallBadge("Action Required", "err"); if (progress) progress.textContent = profile.error ?? "POS Profile load failed"; showSettingsMessage(profile.error ?? "POS Profile load failed."); showScreen("settings"); return; }
    showPosProfile(profile.profile, profile.error); setStep("profile", "complete");
    if (profile.profile?.customer) { const defaultCustomer={ name: profile.profile.customer, customer_name: profile.profile.customer, customer_group: "", mobile_no: "", email_id: "", tax_id: "" }; selectedCustomer=defaultCustomer; const customer=await window.posAPI.loadCustomer(defaultCustomer.name); if(customer.customer) selectedCustomer={...defaultCustomer,customer_name:String(customer.customer.customer_name??defaultCustomer.customer_name),customer_group:String(customer.customer.customer_group??""),mobile_no:String(customer.customer.mobile_no??""),email_id:String(customer.customer.email_id??""),tax_id:String(customer.customer.tax_id??"")}; showCustomer(); }
    // 5) POS configuration — refresh only when missing or stale (>12h)
    setStep("config", "running"); if (progress) progress.textContent = "Loading configuration…";
    let cfg = await window.posAPI.getCachedPosConfiguration();
    if (!cfg || ageMs(cfg.lastSynced) > SYNC_FRESH.config) { await syncConfigNow(); cfg = await window.posAPI.getCachedPosConfiguration(); }
    if (cfg) showPosConfigurationSummary(cfg);
    setStep("config", cfg ? "complete" : "warning");
    // 6) Session
    setStep("session", "running"); if (progress) progress.textContent = "Validating session…";
    const ok = await validateSession("startup");
    updatePosHeader(); setupCompleted = true;
    void markDataAvailabilityFromCache(); startBackgroundSync(); void renderSyncStatus();
    if (ok) { setStep("session", "complete"); setOverallBadge("POS Ready", "ok"); if (progress) progress.textContent = "Ready"; showScreen("pos"); }
    else if (!sessionHasEntry) { setStep("session", "warning"); setOverallBadge("Start Shift Required", "info"); if (progress) progress.textContent = "No active POS Opening Entry"; void showStartShift(); }
    else { setStep("session", "failed"); setOverallBadge("Action Required", "err"); if (progress) progress.textContent = sessionState.reason; showScreen("pos"); showSessionInvalid(sessionState.reason); }
  } catch (error) { setOverallBadge("Action Required", "err"); if (progress) progress.textContent = error instanceof Error ? error.message : "Startup failed"; if (retry) retry.hidden = false; showScreen("settings"); }
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
  const profileSelect = document.querySelector<HTMLSelectElement>("#pos-profile") as HTMLSelectElement;
  profileSelect.dataset.savedValue = settings.posProfile;
  // Offline-safe: keep the saved profile selectable before the online dropdown (loadPosProfiles) runs,
  // otherwise offline checkout is blocked with "Missing POS Profile". populatePosProfileDropdown rebuilds this when online.
  if (settings.posProfile) {
    if (!Array.from(profileSelect.options).some((o) => o.value === settings.posProfile)) profileSelect.add(new Option(settings.posProfile, settings.posProfile));
    profileSelect.value = settings.posProfile;
  }
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

type ProtectedAction = "setup_pin" | "reset_pin" | "change_credentials" | "close_shift" | "settings" | "force_sync" | "diagnostics";

function adminMessage(id: string, text: string): void {
  const el = document.querySelector<HTMLElement>(id);
  if (el) el.textContent = text;
}

async function requestSupervisorPinSetup(action: "setup_pin" | "reset_pin"): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>("#admin-supervisor-dialog");
  const title = document.querySelector<HTMLElement>("#admin-supervisor-title");
  const note = document.querySelector<HTMLElement>("#admin-supervisor-note");
  const form = document.querySelector<HTMLFormElement>("#admin-supervisor-form");
  if (!dialog || !form) return false;
  if (!navigator.onLine) {
    alert("Admin PIN reset requires an online connection and authorized ERPNext supervisor credentials.");
    return false;
  }
  if (title) title.textContent = action === "setup_pin" ? "Create Admin PIN" : "Reset Admin PIN";
  if (note) note.textContent = action === "setup_pin"
    ? "First-time PIN setup requires online ERPNext supervisor verification."
    : "Forgot Admin PIN requires online ERPNext supervisor verification.";
  ["#admin-supervisor-user","#admin-supervisor-password","#admin-new-pin","#admin-confirm-pin"].forEach((id)=>{const input=document.querySelector<HTMLInputElement>(id);if(input)input.value="";});
  adminMessage("#admin-supervisor-message", "");
  return new Promise((resolve) => {
    const cleanup = () => { form.onsubmit = null; resolve(false); };
    document.querySelector<HTMLButtonElement>("#admin-supervisor-cancel")!.onclick = () => { dialog.close(); cleanup(); };
    form.onsubmit = async (event) => {
      event.preventDefault();
      const username = document.querySelector<HTMLInputElement>("#admin-supervisor-user")?.value.trim() ?? "";
      const passwordInput = document.querySelector<HTMLInputElement>("#admin-supervisor-password");
      const password = passwordInput?.value ?? "";
      const pinInput = document.querySelector<HTMLInputElement>("#admin-new-pin");
      const confirmInput = document.querySelector<HTMLInputElement>("#admin-confirm-pin");
      const pin = pinInput?.value ?? "";
      const confirmPin = confirmInput?.value ?? "";
      adminMessage("#admin-supervisor-message", "Verifying supervisor...");
      const auth = await window.posAPI.authorizeAdminAction({ username, password, action, terminal_id: (document.querySelector<HTMLInputElement>("#terminal-id")?.value ?? "") });
      if (passwordInput) passwordInput.value = "";
      if (!auth.ok) { adminMessage("#admin-supervisor-message", auth.error ?? "Supervisor authorization failed."); return; }
      const saved = await window.posAPI.setAdminPin({ action, token: auth.token, pin, confirmPin });
      if (pinInput) pinInput.value = "";
      if (confirmInput) confirmInput.value = "";
      if (!saved.ok) { adminMessage("#admin-supervisor-message", saved.error ?? "Unable to save Admin PIN."); return; }
      dialog.close();
      form.onsubmit = null;
      resolve(true);
    };
    dialog.showModal();
    window.setTimeout(()=>document.querySelector<HTMLInputElement>("#admin-supervisor-user")?.focus(),0);
  });
}

async function requireAdminPin(action: ProtectedAction, note: string): Promise<boolean> {
  const status = await window.posAPI.getAdminPinStatus();
  if (!status.configured) return requestSupervisorPinSetup("setup_pin");
  if (status.locked) { alert(`Admin PIN is locked. Try again in ${status.secondsRemaining}s.`); return false; }
  const dialog = document.querySelector<HTMLDialogElement>("#admin-pin-dialog");
  const form = document.querySelector<HTMLFormElement>("#admin-pin-form");
  if (!dialog || !form) return false;
  const title = document.querySelector<HTMLElement>("#admin-pin-title"); if (title) title.textContent = "Admin PIN Required";
  const noteEl = document.querySelector<HTMLElement>("#admin-pin-note"); if (noteEl) noteEl.textContent = note;
  const input = document.querySelector<HTMLInputElement>("#admin-pin-input"); if (input) input.value = "";
  adminMessage("#admin-pin-message", "");
  return new Promise((resolve) => {
    const cleanup = (value: boolean) => { form.onsubmit = null; resolve(value); };
    document.querySelector<HTMLButtonElement>("#admin-pin-cancel")!.onclick = () => { dialog.close(); cleanup(false); };
    document.querySelector<HTMLButtonElement>("#admin-pin-forgot")!.onclick = async () => {
      dialog.close();
      const ok = await requestSupervisorPinSetup("reset_pin");
      cleanup(ok);
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      const pin = document.querySelector<HTMLInputElement>("#admin-pin-input")?.value ?? "";
      adminMessage("#admin-pin-message", "Checking PIN...");
      const result = await window.posAPI.verifyAdminPin(pin);
      const pinInput = document.querySelector<HTMLInputElement>("#admin-pin-input"); if (pinInput) pinInput.value = "";
      if (!result.ok) { adminMessage("#admin-pin-message", result.error ?? "Wrong Admin PIN."); return; }
      dialog.close();
      cleanup(true);
    };
    dialog.showModal();
    window.setTimeout(()=>input?.focus(),0);
  });
}

async function runProtected(action: ProtectedAction, note: string, fn: () => void | Promise<void>): Promise<void> {
  if (!(await requireAdminPin(action, note))) return;
  await fn();
}

async function requireIfAdminConfigured(action: ProtectedAction, note: string): Promise<boolean> {
  const status = await window.posAPI.getAdminPinStatus();
  if (!status.configured) return true;
  return requireAdminPin(action, note);
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
  window.posAPI.onFocusScanner(() => focusCart(true));
  void renderSyncStatus();
  void runPosBootstrap("startup");
  window.addEventListener("online", () => { scheduleCartPreview(); void backgroundSyncTick(); void syncQueueNow(); });
  document.querySelector<HTMLButtonElement>("#retry-startup")?.addEventListener("click", () => void runPosBootstrap("retry"));
  document.querySelector<HTMLButtonElement>("#complete-setup")?.addEventListener("click", (e) => { /* form submit handles save + bootstrap */ void e; });
  document.querySelector<HTMLButtonElement>("#refresh-config")?.addEventListener("click", () => void runProtected("force_sync", "This will refresh POS configuration from ERPNext.", () => syncConfigNow()));
  document.querySelector<HTMLButtonElement>("#start-shift")?.addEventListener("click", () => void startShift());
  document.querySelector<HTMLButtonElement>("#start-shift-refresh")?.addEventListener("click", () => void refreshFromStartShift());
  document.querySelector<HTMLButtonElement>("#start-shift-cancel")?.addEventListener("click", () => void goToPos());
  document.querySelector<HTMLButtonElement>("#start-shift-settings")?.addEventListener("click", () => void runProtected("settings", "Settings contain terminal credentials and sync controls.", () => showScreen("settings")));
  // Close Shift + Shift History actions.
  document.querySelector<HTMLButtonElement>("#pos-close-shift")?.addEventListener("click", () => void runProtected("close_shift", "Close Shift will reconcile payments and prepare the POS Closing Entry.", () => showCloseShift()));
  document.querySelector<HTMLButtonElement>("#pos-sync-queue")?.addEventListener("click", () => void syncQueueNow(true));
  void updateOfflineUi();
  document.querySelector<HTMLButtonElement>("#close-shift-back")?.addEventListener("click", () => showScreen("pos"));
  document.querySelector<HTMLButtonElement>("#close-shift-cancel")?.addEventListener("click", () => showScreen("pos"));
  document.querySelector<HTMLButtonElement>("#close-shift-submit")?.addEventListener("click", () => void runProtected("close_shift", "Submitting Close Shift will create the ERPNext POS Closing Entry, close this shift, print the shift summary, delete held sales, and require a new shift before selling again.", () => submitCloseShift()));
  document.querySelector<HTMLButtonElement>("#close-shift-print")?.addEventListener("click", () => void printShiftSummary());
  document.querySelector<HTMLButtonElement>("#close-shift-hold")?.addEventListener("click", () => void holdCurrentSale());
  document.querySelector<HTMLButtonElement>("#open-shift-history")?.addEventListener("click", () => void openShiftHistory());
  document.querySelector<HTMLButtonElement>("#shift-history-back")?.addEventListener("click", () => { if (shiftClosed) void showStartShift(); else void goToPos(); });
  document.querySelector<HTMLButtonElement>("#open-settings")?.addEventListener("click", () => void runProtected("settings", "Settings contain terminal credentials and sync controls.", () => showScreen("settings")));
  document.querySelector<HTMLButtonElement>("#back-to-pos")?.addEventListener("click", () => void goToPos());
  // Session-invalid overlay actions (non-destructive — cart/customer/payment preserved).
  document.querySelector<HTMLButtonElement>("#session-refresh")?.addEventListener("click", () => void revalidateLive("refresh"));
  document.querySelector<HTMLButtonElement>("#session-switch")?.addEventListener("click", () => void switchToActiveShift());
  document.querySelector<HTMLButtonElement>("#session-go-shift")?.addEventListener("click", () => { clearSessionInvalid(); void showStartShift(); });
  document.querySelector<HTMLButtonElement>("#session-open-settings")?.addEventListener("click", () => void runProtected("settings", "Settings contain terminal credentials and sync controls.", () => { clearSessionInvalid(); showScreen("settings"); }));
  // Revalidate the POS session whenever the window regains focus.
  window.addEventListener("focus", () => { if (isOnline()) void revalidateLive("focus"); });
  // Server-health poll (online/offline + reconnect-driven session revalidation).
  window.setInterval(async () => { try { const online = await window.posAPI.testServer(); const status = document.querySelector<HTMLElement>("#pos-server-status"); const connected = Boolean(online.connected); if (status) status.textContent = connected ? "Online" : "Offline"; setOnlineIndicator(connected);
      if (connected && !prevServerConnected) { scheduleCartPreview(); void revalidateLive("reconnect"); void backgroundSyncTick(); void syncQueueNow(); } // after reconnect: re-check session + drain offline queue + sync stale data
      prevServerConnected = connected; void updateOfflineUi();
    } catch { const status = document.querySelector<HTMLElement>("#pos-server-status"); if (status) status.textContent = "Reconnecting"; prevServerConnected = false; void updateOfflineUi(); } }, 30_000);
  // Revalidate the POS session every 60 seconds while online.
  window.setInterval(() => { if (isOnline()) void revalidateLive("interval"); }, 60_000);

  // Primary action: Save and Complete Setup -> save settings, then run the one bootstrap chain.
  document.querySelector<HTMLFormElement>("#settings-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(await requireIfAdminConfigured("change_credentials", "Saving settings can change ERPNext URL, API credentials, terminal ID, profile, and warehouse."))) return;
    const button = document.querySelector<HTMLButtonElement>("#complete-setup");
    if (button) button.disabled = true;
    try {
      await window.posAPI.saveSettings(getSettingsFromForm());
      showSettingsMessage("Settings saved — completing setup…");
      await runPosBootstrap("complete-setup");
    } catch {
      showSettingsMessage("Unable to save settings");
    } finally {
      if (button) button.disabled = false;
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
    if (!(await requireIfAdminConfigured("change_credentials", "Changing POS Profile changes terminal configuration."))) return;
    try {
      await window.posAPI.saveSettings(getSettingsFromForm());
      showSettingsMessage("POS Profile Saved");
    } catch {
      showSettingsMessage("Unable to save POS Profile");
    }
  });

  document.querySelector<HTMLButtonElement>("#load-pos-profile")?.addEventListener("click", async () => {
    if (!(await requireAdminPin("force_sync", "This will force reload POS Profiles from ERPNext."))) return;
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
    if (!(await requireAdminPin("force_sync", "This will force full POS configuration sync from ERPNext."))) return;
    const button = document.querySelector<HTMLButtonElement>("#sync-pos-configuration");
    if (button) { button.disabled = true; button.textContent = "Syncing…"; }
    try { await window.posAPI.saveSettings(getSettingsFromForm()); await syncConfigNow(); showSettingsMessage("POS Configuration synced"); }
    catch { showSettingsMessage("POS Configuration Sync Failed"); }
    finally { if (button) { button.disabled = false; button.textContent = "Force Full POS Configuration Sync"; } }
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
    if (!(await requireAdminPin("force_sync", "This will force full Item Catalogue sync from ERPNext."))) return;
    const button = document.querySelector<HTMLButtonElement>("#sync-item-catalog");
    if (button) { button.disabled = true; button.textContent = "Syncing…"; }
    try { showCatalogProgress("Catalog sync started…"); await syncItemsNow("full"); showCatalogProgress("Catalog sync complete."); showSettingsMessage("Item catalogue synced"); }
    catch { showCatalogProgress("Catalog sync failed."); }
    finally { if (button) { button.disabled = false; button.textContent = "Force Full Item Catalogue Sync"; } }
  });

  document.querySelector<HTMLButtonElement>("#sync-customers")?.addEventListener("click", async () => { if (!(await requireAdminPin("force_sync", "This will force full Customer sync from ERPNext."))) return; await syncCustomersNow("full"); const state = await window.posAPI.getCustomerSyncState(); showSettingsMessage(`Customers synced: ${state.count}`); });
  document.querySelector<HTMLButtonElement>("#sync-fbr-config")?.addEventListener("click", async () => { if (!(await requireAdminPin("force_sync", "This will force full FBR configuration sync from ERPNext."))) return; const button=document.querySelector<HTMLButtonElement>("#sync-fbr-config"); if(button){button.disabled=true;button.textContent="Syncing...";} try { await syncFbrNow("full"); showSettingsMessage("FBR configuration synced"); } catch { showSettingsMessage("FBR sync failed"); } finally { if(button){button.disabled=false;button.textContent="Force Full FBR Configuration Sync";} } });
  setupUpdateUi();
  document.querySelectorAll<HTMLDetailsElement>(".diagnostics-block").forEach((details) => {
    const summary = details.querySelector("summary");
    summary?.addEventListener("click", (event) => {
      if (details.open) return;
      event.preventDefault();
      void runProtected("diagnostics", "Advanced Diagnostics can expose local paths, cache state, sync controls, and credential utilities.", () => { details.open = true; });
    });
  });
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
  document.querySelector<HTMLElement>("#pos-screen")?.addEventListener("pointerup", (event) => {
    if (!isEditableElement(event.target as Element | null)) focusCart(true);
  });
  document.querySelector("#cart-qty")?.addEventListener("click", () => void editSelectedQuantity());
  document.querySelector("#cart-remove")?.addEventListener("click", () => void removeSelectedCartRow());
  document.querySelector("#cart-clear")?.addEventListener("click", async () => { if (!cartLines.length || !confirm("Clear the full cart?")) return; cartLines=[]; selectedCartIndex=-1; await afterCartMutation("Cart cleared"); });
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
  // Refund controls (registered once).
  document.querySelector<HTMLButtonElement>('#refund-back')?.addEventListener('click', () => void openSalesHistory());
  document.querySelector<HTMLButtonElement>('#refund-full')?.addEventListener('click', () => setRefundFull());
  document.querySelector<HTMLButtonElement>('#refund-clear')?.addEventListener('click', () => clearRefundQty());
  document.querySelector<HTMLButtonElement>('#refund-submit')?.addEventListener('click', () => void submitRefund());
  // Escape must not silently discard a submitted-but-unclosed receipt; require the explicit button.
  document.querySelector<HTMLDialogElement>('#receipt-dialog')?.addEventListener('cancel', (e) => e.preventDefault());
  // Benefits dialog controls
  document.querySelector<HTMLButtonElement>('#benefits-max-points')?.addEventListener('click', () => { const input = document.querySelector<HTMLInputElement>('#benefits-redeem-points'); if (input) { input.value = String(customerBenefits.availablePoints); input.focus(); } });
  document.querySelector<HTMLButtonElement>('#benefits-apply')?.addEventListener('click', () => void applyBenefits());
  document.querySelector<HTMLButtonElement>('#benefits-remove')?.addEventListener('click', () => void removeBenefits());
  document.querySelector<HTMLInputElement>('#benefits-redeem-points')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void applyBenefits(); } });
  document.querySelector<HTMLInputElement>('#benefits-coupon-code')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void applyBenefits(); } });
  document.addEventListener("keydown", (event) => {
    // Refund quantity inputs own their keystrokes — never let global POS shortcuts intercept typing/arrows there.
    if ((document.activeElement as HTMLElement | null)?.closest("#refund-items")) return;
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
    if (captureScannerTextKey(event)) return;
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
