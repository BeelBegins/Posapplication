interface DatabaseStatus {
  isReady: boolean;
  path: string;
  schemaVersion: string | null;
}

interface PosAPI {
  getRuntimeInfo: () => Promise<{ platform: "electron" | "capacitor" | "web"; product: "pos" | "restaurant" | "sales" | "shopping"; capabilities: Record<string, boolean> }>;
  getDatabaseStatus: () => Promise<DatabaseStatus>;
  focusPosWindow: () => Promise<boolean>;
  onFocusScanner: (callback: () => void) => void;
  saveSettings: (settings: AppSettings) => Promise<void>;
  loadSettings: () => Promise<RendererSettings>;
  provisionCredentials: (input: { erpnextUrl: string; username: string; password: string }) => Promise<{ success: boolean; apiKey: string; apiSecret: string; error: string | null }>;
  listPrinters: () => Promise<{ name: string; displayName: string }[]>;
  testServer: () => Promise<{ connected: boolean }>;
  testLogin: () => Promise<{ success: boolean; loggedUser: string | null }>;
  cashierLogin: (input: Record<string, unknown>) => Promise<CashierLoginResult>;
  cashierOfflineLogin: (input: Record<string, unknown>) => Promise<CashierLoginResult>;
  getRememberedCashiers: () => Promise<string[]>;
  loadPosProfiles: () => Promise<{ success: boolean; profiles: PosProfileOption[]; error: string | null }>;
  loadPosProfile: () => Promise<{ success: boolean; profile: PosProfileDetails | null; error: string | null; syncedAt: string | null }>;
  getPosProfileCacheStatus: () => Promise<{ isReady: boolean; lastSynced: string | null }>;
  syncPosConfiguration: () => Promise<{ success: boolean; summary: PosConfigurationSummary | null; error: string | null }>;
  getCachedPosConfiguration: () => Promise<PosConfigurationSummary | null>;
  syncPosSession: (input?: Record<string, unknown>) => Promise<{ success: boolean; summary: PosSessionSummary; error: string | null }>;
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
  getActivePosSession: (input?: Record<string,unknown>) => Promise<{success:boolean;session:Record<string,unknown>|null;error:string|null;diagnosticReason:string;apiUser:string;requestedPosProfile:string;entries:Record<string,unknown>[]}>;
  startPosSession: (input: Record<string,unknown>) => Promise<{success:boolean;session:Record<string,unknown>|null;error:string|null}>;
  getCustomerBenefits: (customerName: string) => Promise<{ loyaltyProgram: string | null; availablePoints: number; conversionFactor: number; error: string | null }>;
  validateCoupon: (couponCode: string) => Promise<{ couponName: string | null; discountAmount: number; error: string | null }>;
  listCustomerGiftVouchers: (customerName: string) => Promise<{ vouchers: GiftVoucher[]; error: string | null }>;
  validateGiftVoucherCode: (voucherCode: string, customerName: string) => Promise<{ voucher: GiftVoucher | null; error: string | null }>;
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
  getShiftSummary: (input?: Record<string, unknown>) => Promise<{ success: boolean; summary: ShiftSummary | null; error: string | null }>;
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
  authorizeAdminAction: (input: Record<string, unknown>) => Promise<{ ok: boolean; token: string; error: string | null }>;
  resetCashierOfflinePin: (input: Record<string, unknown>) => Promise<{ ok: boolean; error: string | null }>;
  pushCustomerDisplay: (payload: Record<string, unknown>) => void;
  previewCustomerDisplay: () => Promise<"opened-fullscreen" | "opened-windowed" | "focused" | "no-second-display">;
}

interface ReleaseEntry { tag: string; version: string; name: string; notes: string; publishedAt: string; prerelease: boolean; exeName: string; exeUrl: string; exeApiUrl: string; }

interface ShiftPaymentRow { mode_of_payment: string; opening_amount: number; collected_amount: number; expected_amount: number; sale_amount?: number; refund_amount?: number; net_movement?: number; }
interface CashierLoginResult { success: boolean; user: string; fullName: string; roles: string[]; allowedPosProfiles: string[]; defaultPosProfile: string; canStartShift: boolean; canRefund: boolean; canCloseShift: boolean; canOfflineSale: boolean; offlineLoginExpiresAt: string; requirePinSetup: boolean; offlineCached?: boolean; offlineLogin?: boolean; error: string | null; }
interface CashierSession extends CashierLoginResult { loginTime: string; }
interface ShiftSummary { openingEntry: string; posProfile: string; user: string; company: string; periodStart: string; postingDate: string; status: string; payments: ShiftPaymentRow[]; invoiceCount: number; netSales: number; refunds: number; totalOpening: number; totalExpected: number; isEstimate: boolean; }
interface ShiftHistoryRow { openingEntry: string; closingEntry: string | null; posProfile: string; cashier: string; company: string; openedAt: string | null; closedAt: string | null; openingCash: number; expectedCash: number; actualCash: number; difference: number; netSales: number; status: string; summary: Record<string, unknown> | null; createdAt: string; }

interface HeldSaleSummary { id: number; terminalInvoiceId: string; displayName: string; customer: string; customerName: string; posProfile: string; openingEntry: string; itemCount: number; estimatedTotal: number; createdAt: string; updatedAt: string; status: string; }
interface HeldSaleDetail extends HeldSaleSummary { company: string; branch: string; cart: unknown[]; payments: unknown[]; benefits: Record<string, unknown> | null; totals: Record<string, unknown> | null; validationSnapshot: Record<string, unknown> | null; }
interface SalesHistoryRow { terminalInvoiceId: string; posInvoice: string | null; status: string; createdAt: string; submittedAt: string | null; reprintCount: number; lastReprintedAt: string | null; payload: Record<string, unknown> | null; response: Record<string, unknown> | null; }

interface AppliedBenefits {
  loyaltyPoints: number;
  couponCode: string;
  giftVoucherCode?: string;
  cartKey?: string;
}

interface GiftVoucher {
  name?: string;
  voucher_code?: string;
  amount?: number;
  issue_date?: string;
  expiry_date?: string;
  branch?: string;
  minimum_redemption_value?: number;
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
interface CatalogSearchResult { itemCode: string; itemName: string; barcode: string | null; uom: string; conversionFactor: number; sellingPrice: number | null; currency: string | null; actualStock: number | null; warehouse: string | null; mrp: number | null; }
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
  receiptPrinter: string;
  colorTheme?: string;
}

interface RendererSettings {
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

interface Window {
  posAPI: PosAPI;
}

function isCapacitorRuntime(): boolean {
  return document.documentElement.dataset.platform === "capacitor";
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
let salesHistoryRenderToken = 0;                              // guards a background refund-status patch from clobbering a newer search/filter render
let refundSubmitting = false;
let paymentMethods: string[] = [];
const PAYMENT_METHOD_GRID_COLUMNS = 3; // must match .payment-methods CSS grid-template-columns
let selectedPaymentMethodIndex = 0;
let paymentRows: PaymentRow[] = [];
let paymentsOutdated = false;
let prevServerConnected = false;
let cashierSession: CashierSession | null = null;
// "reset" is handled entirely by requestSupervisorPinSetup (a separate supervisor-
// authorized dialog), never by this in-form mode - see the #cashier-pin-reset handler.
type CashierPinMode = "login" | "setup" | "change";
let cashierPinMode: CashierPinMode = "login";
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
function emptyBenefits(): AppliedBenefits { return { loyaltyPoints: 0, couponCode: "", giftVoucherCode: "" }; }
function normalizeBenefits(value: AppliedBenefits | Record<string, unknown> | null | undefined): AppliedBenefits {
  return { loyaltyPoints: Number(value?.loyaltyPoints) || 0, couponCode: String(value?.couponCode ?? ""), giftVoucherCode: String(value?.giftVoucherCode ?? "") };
}
let appliedBenefits: AppliedBenefits = emptyBenefits();
let customerBenefits = { loyaltyProgram: "", availablePoints: 0, conversionFactor: 1 };
let customerGiftVouchers: GiftVoucher[] = [];
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
// Electron/Chromium blurs the BrowserWindow at the OS level when a native
// confirm()/alert() dialog opens, and does not reliably restore it afterward —
// leaving keyboard input dead (Enter, digit shortcuts, typing) until the user
// alt-tabs away and back. window:focus-pos (focusPosWindow) already exists
// for exactly this class of problem (used by afterCartMutation) but wasn't
// wired to the many confirm()/alert() call sites — these two wrappers are
// drop-in replacements that add that native refocus on close.
function appConfirm(message: string): boolean {
  const result = confirm(message);
  void window.posAPI.focusPosWindow();
  return result;
}
function appAlert(message: string): void {
  alert(message);
  void window.posAPI.focusPosWindow();
}
function cartMessage(message: string): void { const e = document.querySelector<HTMLElement>("#cart-message"); if (e) e.textContent = message; }
function clearCartSearch(): void { cartSearchResults = []; selectedSearchIndex = 0; const input = cartInput(); if (input) input.value = ""; document.querySelector<HTMLElement>("#cart-search-results")?.replaceChildren(); }
type PosScreen = "pos" | "settings" | "cashier-login" | "start-shift" | "close-shift" | "shift-history" | "held-sales" | "sales-history" | "refund";
const screenIds: Record<PosScreen, string> = { pos: "#pos-screen", settings: "#settings-screen", "cashier-login": "#cashier-login-screen", "start-shift": "#start-shift-screen", "close-shift": "#close-shift-screen", "shift-history": "#shift-history-screen", "held-sales": "#held-sales-screen", "sales-history": "#sales-history-screen", refund: "#refund-screen" };
// Switches the visible view without touching cart/customer/payment state.
function showScreen(screen: PosScreen): void {
  for (const [key, selector] of Object.entries(screenIds)) { const el = document.querySelector<HTMLElement>(selector); if (el) el.hidden = key !== screen; }
  if (screen === "pos") focusCart(true);
}
function cashierDisplay(): string { return cashierSession ? (cashierSession.fullName || cashierSession.user) : ""; }
function cashierRequest(): Record<string, unknown> { return cashierSession ? { cashier_user: cashierSession.user } : {}; }
function sameUser(a: string, b: string): boolean { return a.trim().toLowerCase() === b.trim().toLowerCase(); }
function matchingSessionEntry(entries: Record<string, unknown>[], selectedProfile: string, cashierUser: string): Record<string, unknown> | null {
  const matches = entries.filter((entry) => {
    const status = String(entry.status ?? "Open");
    const docstatus = entry.docstatus === undefined || entry.docstatus === null || entry.docstatus === "" ? 1 : Number(entry.docstatus);
    const profile = String(entry.pos_profile ?? "");
    const user = String(entry.user ?? "");
    return status === "Open"
      && docstatus === 1
      && (!profile || !selectedProfile || sameUser(profile, selectedProfile))
      && (!user || sameUser(user, cashierUser));
  });
  return matches.length === 1 ? matches[0] : null;
}
function activeEntriesReason(entries: Record<string, unknown>[], selectedProfile: string, cashierUser: string, fallback: string): string {
  const active = entries.filter((entry) => {
    const status = String(entry.status ?? "Open");
    const docstatus = entry.docstatus === undefined || entry.docstatus === null || entry.docstatus === "" ? 1 : Number(entry.docstatus);
    return status === "Open" && docstatus === 1;
  });
  if (!active.length) return fallback;
  const summary = active.slice(0, 3).map((entry) => {
    const name = String(entry.name ?? entry.opening_entry ?? "unknown");
    const user = String(entry.user ?? "unknown user");
    const profile = String(entry.pos_profile ?? "unknown profile");
    return `${name} | ${user} | ${profile}`;
  }).join("; ");
  return `Active shift exists but is not available for cashier ${cashierUser} on profile ${selectedProfile}. ${summary}. Login as that cashier or close that shift in ERPNext.`;
}
// Reads the (already-set-elsewhere) textContent of the three header status
// fields and reflects it as a data-state attribute for CSS badge coloring —
// purely a presentation layer on top of existing state, no new state of its
// own, so it's safe to call opportunistically rather than threading it
// through every place that currently sets these fields' text.
function refreshHeaderStatusBadges(): void {
  const server = document.querySelector<HTMLElement>("#pos-server-status");
  if (server) { const text = server.textContent ?? ""; server.dataset.state = text === "Online" ? "ok" : text === "Reconnecting" ? "warn" : "err"; }
  const sync = document.querySelector<HTMLElement>("#pos-sync-status");
  if (sync) { const text = sync.textContent ?? ""; sync.dataset.state = text === "Ready" ? "ok" : text === "Session Invalid" ? "err" : text && text !== "—" ? "warn" : "neutral"; }
  const queue = document.querySelector<HTMLElement>("#pos-queue-status");
  if (queue) queue.dataset.state = queue.classList.contains("queue-pending") ? "warn" : "ok";
}
function updatePosHeader(): void { const set = (id: string, value: string) => { const e = document.querySelector<HTMLElement>(id); if (e) e.textContent = value || "—"; }; set("#pos-branch", (document.querySelector<HTMLInputElement>("#branch")?.value ?? "")); set("#pos-profile-name", document.querySelector<HTMLSelectElement>("#pos-profile")?.value ?? ""); set("#pos-terminal", document.querySelector<HTMLInputElement>("#terminal-id")?.value ?? ""); set("#pos-cashier", cashierDisplay()); set("#pos-opening-entry", document.querySelector<HTMLElement>("#session-opening-entry")?.textContent ?? ""); refreshHeaderStatusBadges(); }
function showCustomer(): void { const e=document.querySelector<HTMLElement>("#pos-customer"); if(e)e.textContent=selectedCustomer?`${selectedCustomer.customer_name || selectedCustomer.name}${navigator.onLine?"":" (Cached)"}`:"—"; }
function customerInput(): HTMLInputElement | null { return document.querySelector<HTMLInputElement>("#customer-search"); }
async function selectCustomer(customer: CustomerResult): Promise<void> { const result=await window.posAPI.loadCustomer(customer.name); selectedCustomer=customer; showCustomer(); // mark payment and benefits allocation outdated when customer changes
  if (paymentRows.length) paymentsOutdated = true;
  appliedBenefits=emptyBenefits(); customerGiftVouchers=[]; benefitsOutdated=true;
  customerBenefits={loyaltyProgram:"",availablePoints:0,conversionFactor:1};
  void loadCustomerBenefits();
  scheduleCartPreview(); const data=result.customer; const detail=document.querySelector<HTMLElement>("#customer-detail"); if(detail)detail.textContent=data?`${String(data.customer_name??customer.customer_name)} | ${String(data.mobile_no??"")} | ${String(data.customer_group??"")} | ${String(data.loyalty_program??"")}${result.cached?" (Cached)":""}`:result.error??"Customer unavailable"; document.querySelector<HTMLDialogElement>("#customer-dialog")?.close(); focusCart(); }

async function searchCustomer(preserveSelection = false): Promise<void> { const query=customerInput()?.value.trim()??""; customerResults=await window.posAPI.searchCustomers(query); if(!preserveSelection) selectedCustomerIndex=0; selectedCustomerIndex=Math.min(selectedCustomerIndex,Math.max(0,customerResults.length-1)); const box=document.querySelector<HTMLElement>("#customer-results"); if(!box)return; box.replaceChildren(...customerResults.map((c,i)=>{const b=document.createElement("button");b.type="button";b.className=`secondary-button search-result${i===selectedCustomerIndex?" selected":""}`;b.textContent=`${c.name} — ${c.customer_name} | ${c.mobile_no||c.email_id||c.tax_id||""}`;b.onclick=()=>void selectCustomer(c);return b;})); box.querySelector<HTMLElement>(".selected")?.scrollIntoView({block:"nearest"}); }
function openCustomerSearch(): void { const dialog=document.querySelector<HTMLDialogElement>("#customer-dialog"); if(!dialog)return; dialog.showModal(); const createButton=document.querySelector<HTMLButtonElement>("#new-customer"); if(createButton)createButton.disabled=!isOnline(); const detail=document.querySelector<HTMLElement>("#customer-detail"); if(detail)detail.textContent=isOnline()?"":"Online connection required to create a customer."; const input=customerInput(); if(input){input.value="";input.focus();} void searchCustomer(); }
function isOnline(): boolean { return document.querySelector<HTMLElement>("#pos-server-status")?.textContent === "Online"; }
function fmtMoney(value: number): string { return money2(value).toFixed(2); }
function setText(id: string, value: string): void { const e = document.querySelector<HTMLElement>(id); if (e) e.textContent = value || "—"; }

async function offlineLocalBlocker(requirePayment = false): Promise<string | null> {
  const [cfg, totals, methods] = await Promise.all([
    window.posAPI.getCachedPosConfiguration().catch(() => null),
    window.posAPI.getCatalogTotals().catch(() => ({ items: 0, prices: 0, barcodes: 0, stockRows: 0, lastSynced: null })),
    window.posAPI.getPaymentMethods().catch(() => [] as string[])
  ]);
  if (!cfg) return "No cached POS configuration.";
  if (!methods.length) return "No cached payment methods.";
  if (!totals.items || !totals.prices) return "No local item/price data.";
  if (!selectedCustomer) return "Missing Customer.";
  if (!cartLines.length) return "Cart is empty.";
  if (cartLines.some((line) => line.sellingPrice === null || line.sellingPrice === undefined)) return "Missing local item price.";
  if (appliedBenefits.giftVoucherCode) return "Gift voucher redemption requires ERPNext online validation. Remove voucher to sell offline.";
  if (requirePayment && remainingAmount() > 0.0001) return "Payment is incomplete.";
  if (requirePayment && paymentPreparedVersion !== currentCartVersion) return "Payment not prepared for current cart.";
  if (requirePayment && paymentsOutdated) return "Payment draft is outdated.";
  return null;
}

// --- Offline sale queue UI ---------------------------------------------------
// Reflect connectivity + pending-queue count in the header badge and the OFFLINE banner.
async function updateOfflineUi(): Promise<void> {
  const online = isOnline();
  let counts = { queued: 0, failed: 0 };
  try { counts = await window.posAPI.getQueueStatus(); } catch { /* DB not ready — leave zeros */ }
  const queueEl = document.querySelector<HTMLElement>("#pos-queue-status");
  if (queueEl) { queueEl.textContent = counts.queued > 0 ? `${counts.queued} pending` : (online ? "Synced" : "—"); queueEl.className = counts.queued > 0 ? "queue-pending" : ""; }
  refreshHeaderStatusBadges();
  const banner = document.querySelector<HTMLElement>("#pos-offline-banner");
  const text = document.querySelector<HTMLElement>("#pos-offline-text");
  const show = !online || counts.queued > 0;
  if (banner) banner.hidden = !show;
  if (text) text.textContent = !online
    ? `Offline Session — Sales Queued${counts.queued ? ` (${counts.queued} pending)` : ""}.`
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
    if (manual || r.synced || r.failed || r.error) cartMessage(r.error ? `Queue sync stopped: ${r.error}. ${r.remaining} sale(s) remain queued.` : `Queue sync: ${r.synced} synced${r.failed ? `, ${r.failed} failed` : ""}${r.remaining ? `, ${r.remaining} remaining` : ""}.`);
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
  setText("#shift-cashier", cashierDisplay());
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
function isActiveSessionStartError(error: string | null | undefined): boolean {
  const message = (error ?? "").trim().toLowerCase();
  if (!message || message.includes("no active")) return false;
  return /active (session|shift|pos opening entry) found/.test(message)
    || /already (has )?(an )?(open|active) (pos )?(opening entry|shift|session)/.test(message)
    || /(pos opening entry|shift|session) (already )?(is )?(open|active)/.test(message);
}
async function startShift(): Promise<void> {
  const message = document.querySelector<HTMLElement>("#start-shift-message");
  const button = document.querySelector<HTMLButtonElement>("#start-shift");
  if (startShiftInFlight) return;                                          // prevent duplicate submission
  if (!cashierSession) { if (message) message.textContent = "Cashier login is required before starting shift."; showScreen("cashier-login"); return; }
  if (cashierSession.offlineLogin) { if (message) message.textContent = "Start Shift requires online cashier login."; return; }
  if (!cashierSession.canStartShift) { if (message) message.textContent = "This cashier is not allowed to start shift."; return; }
  if (!isOnline()) { if (message) message.textContent = "Online connection required to start shift"; return; }
  const balances = [...document.querySelectorAll<HTMLInputElement>("#shift-opening-amounts input")]
    .map((input) => ({ mode_of_payment: input.dataset.mode ?? "", opening_amount: Number(input.value) || 0 }))
    .filter((row) => Boolean(row.mode_of_payment));
  if (!balances.length) { if (message) message.textContent = "No payment methods loaded from POS Profile"; return; }
  startShiftInFlight = true;
  if (button) button.disabled = true;
  if (message) message.textContent = "Starting shift…";
  try {
    const result = await window.posAPI.startPosSession({ opening_balances: balances, cashier_user: cashierSession.user });
    if (!result.success || !result.session) {
      if (isActiveSessionStartError(result.error)) {
        if (message) message.textContent = "Active session found. Loading existing shift...";
        await refreshFromStartShift();
        return;
      }
      if (message) message.textContent = result.error ?? "Unable to start shift";
      return;
    }
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
function shiftNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return null;
}
function normalizeShiftSummary(summary: ShiftSummary): ShiftSummary {
  const payments = summary.payments.map((p) => {
    const opening = money2(shiftNumber(p.opening_amount) ?? 0);
    const collected = money2(shiftNumber(p.collected_amount) ?? 0);
    const saleRaw = shiftNumber(p.sale_amount);
    const refundRaw = shiftNumber(p.refund_amount);
    const sale = money2(saleRaw ?? Math.max(collected, 0));
    let refund = money2(refundRaw ?? Math.min(collected, 0));
    if (refund > 0) refund = -refund;
    const net = money2((saleRaw !== null || refundRaw !== null) ? sale + refund : (shiftNumber(p.net_movement) ?? (sale + refund)));
    const expected = money2(opening + net);
    return { ...p, opening_amount: opening, collected_amount: net, sale_amount: sale, refund_amount: refund, net_movement: net, expected_amount: expected };
  });
  return {
    ...summary,
    payments,
    netSales: money2(payments.reduce((sum, p) => sum + (p.sale_amount ?? 0), 0)),
    refunds: money2(payments.reduce((sum, p) => sum + (p.refund_amount ?? 0), 0)),
    totalOpening: money2(payments.reduce((sum, p) => sum + p.opening_amount, 0)),
    totalExpected: money2(payments.reduce((sum, p) => sum + p.expected_amount, 0))
  };
}
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
  if (!cashierSession) { cartMessage("Cashier login required."); await showCashierLogin("Cashier login required."); return; }
  if (!cashierSession.canCloseShift) { cartMessage("This cashier is not allowed to close shift."); showScreen("pos"); return; }
  if (cashierSession?.offlineLogin) { cartMessage("Close Shift requires online cashier login."); showScreen("pos"); return; }
  if (!isOnline()) { if (message) message.textContent = "Online connection required to close shift"; showSessionInvalid("Server is offline"); return; }
  // Validate there is an active shift before opening the form.
  if (!(await validateSession("close-shift"))) { showScreen("pos"); showSessionInvalid(sessionState.reason); return; }
  if (txnInProgress()) { showScreen("pos"); if (message) message.textContent = ""; cartMessage("Finish or hold the current sale/payment before closing the shift."); return; }
  // Drain any queued offline sales first so expected totals (server POS Invoices) include them.
  await syncQueueNow();
  const queue = await window.posAPI.getQueueStatus().catch(() => ({ queued: 0, failed: 0 }));
  const result = await window.posAPI.getShiftSummary({ opening_entry: sessionState.openingEntry, cashier_user: cashierSession.user });
  if (!result.success || !result.summary) { showScreen("pos"); cartMessage(result.error ?? "Unable to load shift summary"); return; }
  closeShiftSummary = normalizeShiftSummary(result.summary);
  const s = closeShiftSummary;
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
  const normalizedSummary = closeShiftSummary;
  if (box && normalizedSummary) box.replaceChildren(...normalizedSummary.payments.map((p) => {
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
  if (!cashierSession) { if (message) message.textContent = "Cashier login required."; return; }
  if (!cashierSession.canCloseShift) { if (message) message.textContent = "This cashier is not allowed to close shift."; return; }
  if (!isOnline()) { if (message) message.textContent = "Online connection required to close shift"; return; }
  if (!closeShiftSummary) { if (message) message.textContent = "Shift summary not loaded"; return; }
  // Re-validate the session immediately before submitting.
  if (!(await validateSession("close-submit"))) { if (message) message.textContent = sessionState.reason || "POS session is no longer active"; return; }
  const rows = reconRows();
  const totalDiff = rows.reduce((sum, r) => sum + (r.actual - r.expected), 0);
  const heldCount = await window.posAPI.listHeldSales().then((rows) => rows.length).catch(() => 0);
  if (!appConfirm(`Close Shift will submit an ERPNext POS Closing Entry, mark this shift closed, print the shift summary, delete ${heldCount} held sale(s), and block new sales until a new shift is opened. Continue?`)) return;
  if (Math.abs(totalDiff) >= 0.005 && !appConfirm(`There is a difference of ${fmtMoney(totalDiff)} between counted and expected amounts. Submit the closing entry anyway?`)) return;
  closeShiftInFlight = true;
  if (button) button.disabled = true;
  if (message) message.textContent = "Submitting closing entry…";
  try {
    const result = await window.posAPI.closeShift({
      opening_entry: closeShiftSummary.openingEntry,
      cashier_user: cashierSession?.user ?? "",
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
function showShiftHistorySummary(r: ShiftHistoryRow): void { appAlert(shiftReportText(r)); }
function printShiftReport(r: ShiftHistoryRow): void {
  const html = `<pre style="font:13px monospace;padding:16px;white-space:pre-wrap">${shiftReportText(r).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c))}</pre>`;
  void window.posAPI.printReceipt(html);
}
async function openNewCustomer(): Promise<void> { const error=document.querySelector<HTMLElement>("#customer-detail"); if(!isOnline()){if(error)error.textContent="Online connection required to create a customer.";return;} const options=await window.posAPI.getCustomerCreationOptions(); if(options.error){if(error)error.textContent=options.error;return;} const fill=(id:string,values:string[])=>{const select=document.querySelector<HTMLSelectElement>(id);if(select)select.replaceChildren(...values.map(v=>new Option(v,v)));}; fill("#new-customer-group",options.groups);fill("#new-customer-territory",options.territories);document.querySelector<HTMLDialogElement>("#new-customer-dialog")?.showModal();document.querySelector<HTMLInputElement>("#new-customer-name")?.focus(); }
async function persistCart(): Promise<void> { await window.posAPI.saveCart(cartLines); }
function previewNumber(data: Record<string, unknown> | null, ...keys: string[]): number | null { for(const key of keys){const value=data?.[key];if(typeof value==="number")return value;if(typeof value==="string"&&!Number.isNaN(Number(value)))return Number(value);}return null; }
function setCartText(id:string,value:string):void{const e=document.querySelector<HTMLElement>(id);if(e)e.textContent=value;}
function asTotalsRecord(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function previewLineSellingRate(row: Record<string, unknown>): number | null {
  const quantity = previewNumber(row, "quantity", "qty");
  const lineAmount = previewNumber(row, "line_amount");
  if (quantity !== null && quantity > 0 && lineAmount !== null) return money2(lineAmount / quantity);
  return previewNumber(row, "price_list_rate", "rate");
}

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

  // 3) Validate the exact cart / customer / coupon / loyalty / voucher state with the server.
  const previewInput: Record<string, unknown> = {
    customer: selectedCustomer?.name ?? "",
    items: cartLines.map((line) => ({ item_code: line.itemCode, uom: line.uom, qty: line.quantity }))
  };
  if (appliedBenefits.loyaltyPoints > 0) { previewInput.redeem_loyalty_points = appliedBenefits.loyaltyPoints; previewInput.loyalty_points = appliedBenefits.loyaltyPoints; }
  if (appliedBenefits.couponCode) previewInput.coupon_code = appliedBenefits.couponCode;
  if (appliedBenefits.giftVoucherCode) previewInput.gift_voucher_code = appliedBenefits.giftVoucherCode;

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
  const previewTotals = asTotalsRecord(preview.totals);
  const merged: Record<string, unknown> = { ...preview, ...(previewTotals ?? {}) };
  const differs = fbrTotalsDiffer(localFbrTotals, merged);

  // Apply server item FBR values (per-line price/rate).
  const items = Array.isArray(preview.items) ? preview.items : Array.isArray(preview.rows) ? preview.rows : [];
  for (const item of items) {
    const row = asTotalsRecord(item);
    if (!row) continue;
    const code = String(row.item_code ?? "");
    const uom = String(row.uom ?? "");
    const line = cartLines.find((x) => x.itemCode === code && (!uom || x.uom === uom));
    const rate = previewLineSellingRate(row);
    if (line && rate !== null) line.sellingPrice = rate;
  }

  // Apply server totals — keep the server's own fields and supplement the display keys from the FBR totals.
  const serverFbr = extractFbrTotals(merged);
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

interface FbrTotalsView { merchandise: number; saleBeforeTax: number; salesTax: number; serviceFee: number; loyaltyAmount: number; giftVoucherAmount: number; giftVoucherError: string; grandTotal: number; payable: number; }
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
  const giftVoucherAmount = previewNumber(serverTotals, "gift_voucher_amount") ?? 0;
  const giftVoucherError = String(serverTotals?.gift_voucher_error ?? "");
  const localGrandTotal = money2(merchandise + serviceFee); // FBR POS service fee is added on top of the tax-inclusive goods total
  const serverGrandTotal = previewNumber(serverTotals, "rounded_total", "grand_total");
  const grandTotal = Math.max(0, money2(serverGrandTotal !== null && serverGrandTotal > 0 ? serverGrandTotal : localGrandTotal));
  const amountDue = previewNumber(serverTotals, "amount_due");
  const payable = Math.max(0, money2(amountDue ?? (grandTotal - loyaltyAmount - giftVoucherAmount)));
  return { merchandise, saleBeforeTax, salesTax, serviceFee, loyaltyAmount, giftVoucherAmount, giftVoucherError, grandTotal, payable };
}
function payableAmount():number{ return fbrTotalsView().payable; }
async function persistPayments():Promise<void>{await window.posAPI.savePaymentDraft(paymentRows);}
function paidAmount():number{return paymentRows.reduce((s,x)=>s+x.amount,0);}
function remainingAmount():number{return Math.max(0,money2(payableAmount()-paidAmount()));}
// Lightweight refresh of the Payable / Tendered / Paid / Remaining / Change figures (no row rebuild).
function refreshPaymentSummary():void{const input=document.querySelector<HTMLInputElement>("#payment-amount");const tendered=Number(input?.value)||0;const payable=payableAmount(),paid=paidAmount(),remaining=Math.max(0,money2(payable-paid));setCartText("#payment-payable",payable.toFixed(2));setCartText("#payment-tendered",tendered.toFixed(2));setCartText("#payment-allocated",paid.toFixed(2));setCartText("#payment-remaining",remaining.toFixed(2));setCartText("#payment-change",changeDue.toFixed(2));const hint=document.querySelector<HTMLElement>("#payment-amount-hint");if(hint)hint.textContent=`Remaining: ${remaining.toFixed(2)}`;}
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
  // Once fully covered, stop short of auto-closing the dialog — leave it open on a
  // "Payment Ready" state and require one more explicit Complete Payment (F6 or
  // click) so a mistyped last split leg has a beat to be caught/edited before it
  // actually submits, instead of instantly vanishing the moment remaining hits 0.
  if(remainingAmount()<=0.0001){if(msg)msg.textContent="Payment Ready — press F6 or Complete Payment to finish.";document.querySelector<HTMLButtonElement>("#payment-complete")?.focus();return;}
  if(msg)msg.textContent="";if(input)input.focus();}

// "Exact Amount" immediately adds whatever is still owed.
async function addExactAmount():Promise<void>{const input=document.querySelector<HTMLInputElement>("#payment-amount");if(input)input.value=remainingAmount().toFixed(2);await addPayment();}

// F6 / Complete Payment: require any typed amount to be explicitly Added first
// (never silently commit half-typed text as a payment row on the same keypress
// that's meant to finish the sale), then prepare the payment once fully covered.
async function completePaymentAllocation():Promise<void>{
  const input=document.querySelector<HTMLInputElement>("#payment-amount");
  const msg=document.querySelector<HTMLElement>("#payment-message");
  if(input?.value.trim()){if(msg)msg.textContent="Press Enter or Add to save this amount first, then Complete Payment.";input.focus();return;}
  if(remainingAmount()>0.0001){if(msg)msg.textContent="Remaining amount must be zero.";return;}
  await finalizePaymentReady();
}

// Mark the prepared payment for this exact cart version, then immediately submit —
// pressing/clicking Complete Payment when the amount is already fully covered (the
// "Payment Ready" state) IS the cashier's explicit confirmation; a separate F9 press
// right after was a redundant extra step. If submission is blocked for an unrelated
// reason (session, customer, etc.) submitCurrentSale() reports it and leaves focus on
// Complete Sale & Print, same as before, so F9 still works as a manual fallback/retry.
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
  void window.posAPI.focusPosWindow();
  window.setTimeout(()=>document.querySelector<HTMLButtonElement>("#complete-sale")?.focus(),0);
  void submitCurrentSale();
}

function closePaymentDialog():void{ document.querySelector<HTMLDialogElement>('#payment-dialog')?.close(); focusCart(true, true); }
// Single source of truth for why the sale cannot be completed (null === ready).
function blockedSaleReason():string|null{
  const opening=document.querySelector<HTMLElement>("#session-opening-entry")?.textContent??"";
  const terminal=document.querySelector<HTMLInputElement>("#terminal-id")?.value??"";
  const profile=document.querySelector<HTMLSelectElement>("#pos-profile")?.value??"";
  const online=isOnline();
  const giftVoucherError=fbrTotalsView().giftVoucherError;
  return (online&&shiftClosed)?"Shift is closed — start a new shift"
    :(online&&!sessionState.valid)?(sessionState.reason||"POS session is no longer active")
    :(online&&(!opening||opening==="No active POS Opening Entry"))?"No active POS Opening Entry"
    :(online&&isPreviousDateSession())?"Shift was opened on a previous date. Close shift before new sales"
    :!cartLines.length?"Cart is empty"
    :(online&&validatedCartVersion!==currentCartVersion)?(previewError?`Cart not validated — ${previewError}`:"Validating cart…")
    :(online&&appliedBenefits.giftVoucherCode&&giftVoucherError)?giftVoucherError
    :remainingAmount()>0.0001?"Payment is incomplete"
    :paymentPreparedVersion!==currentCartVersion?"Payment not prepared for current cart"
    :paymentsOutdated?"Payment draft is outdated"
    :!terminal?"Missing Terminal ID — assign a Terminal ID to this POS Profile on the server"
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
  if(!cashierSession){cartMessage("Cashier login required.");await showCashierLogin("Cashier login required.");return;}
  if(cashierSession.offlineLogin&&!cashierSession.canOfflineSale){cartMessage("Cashier is not allowed to sell offline.");return;}
  let online=isOnline();
  if(online&&cashierSession.offlineLogin){cartMessage("Online cashier login required for live sales.");await showCashierLogin("Internet is online. Login with ERPNext cashier password to continue live sales.");return;}
  // F9 gate: online requires a live POS session; offline uses local cache/payment checks only.
  if(online&&!(await validateSession("submit"))){
    const reachability=await window.posAPI.testServer().catch(()=>({connected:false}));
    if(!reachability.connected){
      const status=document.querySelector<HTMLElement>("#pos-server-status"); if(status)status.textContent="Offline";
      setOnlineIndicator(false); showServerStatus(false); await updateOfflineUi(); online=false;
    }else{
      showSessionInvalid(sessionState.reason);cartMessage(sessionState.reason);return;
    }
  }
  if(!online){
    if(!cashierSession.offlineLogin){
      cartMessage("Offline sale requires cashier PIN login.");
      await showCashierLogin("Enter cashier username and offline PIN before selling offline.");
      updateCompleteSaleState();
      return;
    }
    const offlineBlocker=await offlineLocalBlocker(true);
    if(offlineBlocker){cartMessage(offlineBlocker);updateCompleteSaleState();return;}
  }
  const reason=blockedSaleReason();
  if(reason){cartMessage(reason);updateCompleteSaleState();return;}
  const terminal=document.querySelector<HTMLInputElement>("#terminal-id")?.value??"";
  const profile=document.querySelector<HTMLSelectElement>("#pos-profile")?.value??"";
  const opening=document.querySelector<HTMLElement>("#session-opening-entry")?.textContent??"";
  const customer=selectedCustomer!;
  if(!terminalInvoiceId)terminalInvoiceId=await window.posAPI.getTerminalInvoiceId();
  submissionInProgress=true;cartMessage(online?"Submitting Sale…":"Saving offline sale…");updateCompleteSaleState();
  // Submission payload unchanged; terminal_invoice_id is preserved across retries (only regenerated after Close & Start New Sale).
  const salePayload={terminal_invoice_id:terminalInvoiceId,terminal_id:terminal,pos_profile:profile,opening_entry:opening,customer:customer.name,items:cartLines.map(x=>({item_code:x.itemCode,qty:x.quantity,uom:x.uom,barcode:x.barcode??undefined})),payments:paymentRows.map(x=>({mode_of_payment:x.method,amount:x.amount})),coupon_code:appliedBenefits.couponCode,gift_voucher_code:appliedBenefits.giftVoucherCode,redeem_loyalty_points:appliedBenefits.loyaltyPoints>0,loyalty_points:appliedBenefits.loyaltyPoints,estimated_total:fbrTotalsView().payable,cashier_user:cashierSession.user,cashier_full_name:cashierSession.fullName||cashierSession.user,offline_authenticated:!online&&cashierSession.offlineLogin===true,offline_auth_method:!online&&cashierSession.offlineLogin===true?"cashier_pin":""};
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
  setCartText("#receipt-title",provisional?"POS Receipt — Offline Queued":"Receipt Preview");
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
  setCartText("#receipt-grand-total",totals.grandTotal.toFixed(2));
  const payBox=document.querySelector<HTMLElement>("#receipt-payments");
  if(payBox)payBox.replaceChildren(...paymentRows.map(row=>{const p=document.createElement("p");const label=document.createElement("span");label.textContent=row.method;const value=document.createElement("strong");value.textContent=row.amount.toFixed(2);p.append(label,value);return p;}));
  setCartText("#receipt-change",changeDue.toFixed(2));
  const fbr=interpretFbr(response);
  setCartText("#receipt-fbr-status",provisional?"Awaiting internet availability":fbr.statusText);
  setCartText("#receipt-fbr-number",provisional?"Pending":(fbr.invoiceNumber||"—"));
  document.querySelector<HTMLElement>("#receipt-fbr-offline-response")?.remove();
  if(provisional){
    const fbrBox=document.querySelector<HTMLElement>(".receipt-fbr");
    if(fbrBox){const p=document.createElement("p");p.id="receipt-fbr-offline-response";const a=document.createElement("span");a.textContent="FBR Response";const b=document.createElement("strong");b.textContent="Will submit automatically when ERPNext is online";p.append(a,b);fbrBox.append(p);}
  }
  const badge=document.querySelector<HTMLElement>("#receipt-fbr-badge");
  if(badge){badge.textContent=provisional?"Offline Queued":(fbr.accepted?"FBR Accepted":fbr.statusText);badge.className=`fbr-badge ${!provisional&&fbr.accepted?"ok":"warn"}`;}
  const qrBox=document.querySelector<HTMLElement>("#receipt-qr");
  if(qrBox){qrBox.replaceChildren();if(provisional){const code=document.createElement("code");code.textContent="Pending";qrBox.append(code);}else if(fbr.qr){if(fbr.qr.startsWith("data:image")){const img=document.createElement("img");img.src=fbr.qr;img.alt="FBR QR";img.className="receipt-qr-img";qrBox.append(img);}else{const code=document.createElement("code");code.textContent=fbr.qr;qrBox.append(code);}}}
  const printBtn=document.querySelector<HTMLButtonElement>("#receipt-print");
  const reprintBtn=document.querySelector<HTMLButtonElement>("#receipt-reprint");
  if(printBtn)printBtn.disabled=true;if(reprintBtn)reprintBtn.hidden=true;lastReceiptHtml=null;
  // Start on the structured fallback; the rendered receipt iframe replaces it once retrieval succeeds.
  const frame=document.querySelector<HTMLIFrameElement>("#receipt-frame");if(frame){frame.removeAttribute("srcdoc");frame.hidden=true;}
  const structured=document.querySelector<HTMLElement>("#receipt-structured");if(structured)structured.hidden=false;
  document.querySelector<HTMLDialogElement>("#receipt-dialog")?.showModal();
  if(provisional){
    // No server invoice yet — print the same structured receipt with offline FBR status text.
    const msg=document.querySelector<HTMLElement>("#receipt-message");
    if(msg)msg.textContent="Offline Session — Sales Queued";
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
    @media print{html,body{width:80mm!important;margin:0!important;padding:0!important;background:#fff!important}button,input,select,textarea,.btn,.print-toolbar,.page-head,.navbar,#navbar,.web-footer,footer,.print-actions,a[href*="download_pdf"],a[href*="pdf"]{display:none!important}.receipt-item-row,.receipt-item,.receipt-totals,.receipt-payments,.receipt-fbr,.receipt-footer,.rc-item,.rc-totals,.rc-fbr,.rc-footer{break-inside:avoid;page-break-inside:avoid}}
    *{box-sizing:border-box}body,.print-format,.pos-receipt{margin:0;padding:0;background:#fff!important;color:#000!important;font-family:Calibri,Arial,sans-serif!important;font-variant-numeric:tabular-nums}
    .print-format,.pos-receipt{width:80mm!important;max-width:80mm!important;margin:0 auto!important;padding:3mm 3mm 4mm!important;font-size:11px!important;line-height:1.35!important}
    .thermal-receipt{width:80mm;max-width:80mm;margin:0 auto;padding:3mm 3mm 4mm;color:#000;background:#fff;font:11px/1.35 Calibri,Arial,sans-serif}
    .receipt-company{font-size:18px;font-weight:800;text-align:center;color:#000}.receipt-title{font-size:15px;font-weight:800;text-align:center;border-top:1px solid #000;border-bottom:1px solid #000;margin:4px 0;padding:3px 0;color:#000}.receipt-label{font-size:15px;font-weight:900;text-align:center;border:2px solid #000;margin:0 0 5px;padding:5px;text-transform:uppercase;color:#000}
    .receipt-body{max-height:none!important;overflow:visible!important;margin:0!important;border:0!important;border-radius:0!important;padding:0!important;background:#fff!important;color:#000!important;font-family:Calibri,Arial,sans-serif!important;font-variant-numeric:tabular-nums!important}
    .receipt-meta{display:block!important;margin:5px 0 7px!important;font-size:11px!important;color:#000!important}.receipt-meta p,.receipt-meta div,.receipt-total-row,.receipt-payment-row,.receipt-fbr-row{display:flex!important;justify-content:space-between!important;gap:8px!important;align-items:flex-start!important;margin:2px 0!important;color:#000!important}.receipt-meta strong{font-weight:900!important;text-align:right!important;word-break:break-word!important}
    .receipt-items-head,.receipt-item{display:grid!important;grid-template-columns:minmax(0,1fr) 12mm 17mm 20mm!important;gap:1.4mm!important;align-items:start!important;width:100%!important;color:#000!important}
    .receipt-items-head{border-top:1px solid #000!important;border-bottom:1px solid #000!important;padding:3px 0!important;margin-top:4px!important;font-size:10px!important;font-weight:900!important}.receipt-items-head span:not(:first-child){text-align:right!important}
    .receipt-items{display:block!important;width:100%!important;margin-top:0!important}.receipt-item{padding:3px 0!important;border-bottom:1px dotted #999!important;font-size:10px!important;font-weight:800!important}.receipt-item span:first-child{font-size:11px!important;font-weight:900!important;white-space:normal!important;overflow-wrap:anywhere!important;line-height:1.2!important}.receipt-item span:not(:first-child){text-align:right!important;white-space:nowrap!important;font-variant-numeric:tabular-nums!important}
    table.receipt-items{width:100%;border-collapse:collapse;margin-top:4px;table-layout:fixed}table.receipt-items th{font-size:10px;font-weight:800;color:#000;border-top:1px solid #000;border-bottom:1px solid #000;padding:3px 0;text-align:right}table.receipt-items th:first-child{text-align:left}table.receipt-items td{font-size:10px;font-weight:700;color:#000;padding:3px 0;text-align:right;vertical-align:top;border-bottom:1px dotted #999}table.receipt-items td:first-child{font-size:11px;font-weight:800;text-align:left;white-space:normal;overflow-wrap:anywhere}table.receipt-items .desc{width:auto}table.receipt-items .qty{width:12mm}table.receipt-items .rate{width:17mm}table.receipt-items .amount{width:20mm}
    .receipt-totals{border-top:1px solid #000!important;margin-top:5px!important;padding-top:4px!important}.receipt-totals p,.receipt-total-row{display:flex!important;justify-content:space-between!important;gap:8px!important;font-size:12px!important;font-weight:800!important;color:#000!important;margin:3px 0!important}.receipt-totals .grand-total,.receipt-total-row.grand{font-size:16px!important;font-weight:900!important;border-top:2px solid #000!important;margin-top:4px!important;padding-top:4px!important}
    .receipt-payments{border:1px solid #000!important;margin-top:5px!important;padding:4px!important}.receipt-payments p,.receipt-payment-row{display:flex!important;justify-content:space-between!important;gap:8px!important;margin:2px 0!important;font-size:11px!important;font-weight:800!important;color:#000!important}.receipt-payment-title{font-size:10px;font-weight:900;text-transform:uppercase}
    .receipt-body>p{display:flex!important;justify-content:space-between!important;gap:8px!important;font-size:11px!important;font-weight:800!important;color:#000!important;margin:4px 0!important}.receipt-body>p strong{font-weight:900!important;text-align:right!important}
    .receipt-fbr{border:1px solid #000!important;margin-top:5px!important;padding:4px!important}.receipt-fbr p{display:flex!important;justify-content:space-between!important;gap:8px!important;margin:3px 0!important;font-size:11px!important;font-weight:800!important;color:#000!important}.receipt-fbr strong{font-weight:900!important;text-align:right!important;word-break:break-word!important}.receipt-fbr-title{font-size:12px;font-weight:900;text-align:center}.receipt-fbr-row,.receipt-fbr-invoice{font-size:11px;font-weight:800;color:#000}.receipt-fbr-invoice{text-align:center;word-break:break-all;margin:4px 0}.receipt-footer{font-size:10px;font-weight:700;text-align:center;border-top:1px dashed #000;margin-top:6px;padding-top:5px;color:#000}
    .rc-company{font-size:18px!important;font-weight:800!important;color:#000!important}.rc-title{font-size:15px!important;font-weight:800!important;color:#000!important}.rc-meta,.rc-meta-row,.rc-fbr-row,.rc-fbr-inv{font-size:11px!important;color:#000!important;font-weight:700!important}
    .rc-meta-lbl,.rc-item-code,.rc-item-nums .c-desc,.rc-terms,.rc-footer{color:#000!important}.rc-col-hdr,.rc-item-nums{display:grid!important;grid-template-columns:minmax(0,1fr) 16mm 20mm 22mm!important;gap:1.5mm!important;color:#000!important}.rc-col-hdr{font-size:10px!important;font-weight:800!important}.rc-item-nums{font-size:10px!important;font-weight:700!important}
    .rc-item{padding:2px 1px!important;border-bottom:1px dotted #999!important}.rc-item-code{display:none!important}.rc-item-name{font-size:11px!important;font-weight:800!important;color:#000!important;overflow:visible!important;display:block!important;line-height:1.2!important}.rc-item-nums .c-num,.rc-col-hdr .c-num{text-align:right!important;white-space:nowrap!important}.rc-item-tax{margin-top:1px!important;padding:1px 2px!important;border-left:0!important;background:transparent!important;font-size:9.5px!important;line-height:1.15!important;color:#000!important;font-weight:800!important}.rc-item-tax-3rd,.rc-item-disc{display:none!important}
    .rc-tot-row{font-size:12px!important;color:#000!important;font-weight:700!important}.rc-tot-row.grand{font-size:16px!important;font-weight:900!important;color:#000!important}.rc-tot-amt{white-space:nowrap!important}.rc-fbr-title{font-size:12px!important;font-weight:900!important;color:#000!important}.rc-fbr-inv b,.rc-fbr-row span:last-child{font-weight:900!important;color:#000!important}.rc-footer{font-size:10px!important;color:#000!important}
    .rc-fbr-qr img,.receipt-qr-img{width:100px!important;height:100px!important;image-rendering:crisp-edges}.duplicate-copy,.return-copy{text-align:center!important;font:900 15px Calibri,Arial,sans-serif!important;border:2px solid #000!important;color:#000!important;background:#fff!important;padding:5px!important;margin:4px 0 6px!important;letter-spacing:1px!important;text-transform:uppercase!important}
  </style>`;
}
function buildLocalReceiptHtml(posInvoice:string):string{
  const structured=document.querySelector<HTMLElement>("#receipt-structured")?.cloneNode(true) as HTMLElement | null;
  if(structured){
    structured.removeAttribute("id");
    structured.querySelectorAll("[id]").forEach((el)=>el.removeAttribute("id"));
    const esc=(value:string)=>value.replace(/[&<>]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]??c));
    const company=(sessionState.company||document.querySelector<HTMLElement>("#config-company")?.textContent||document.querySelector<HTMLInputElement>("#branch")?.value||"POS").trim();
    const profile=(document.querySelector<HTMLSelectElement>("#pos-profile")?.value||sessionState.posProfile||"").trim();
    return `<!doctype html><html><head><meta charset="utf-8">${receiptPrintCss()}</head><body><div class="thermal-receipt"><div class="receipt-company">${esc(company)}</div>${profile?`<div class="receipt-footer" style="border-top:0;margin-top:0;padding-top:0">${esc(profile)}</div>`:""}<div class="receipt-title">POS Receipt - Offline Queued</div>${structured.outerHTML}</div></body></html>`;
  }
  const esc=(value:string)=>value.replace(/[&<>]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]??c));
  return `<!doctype html><html><head><meta charset="utf-8">${receiptPrintCss()}</head><body><div class="thermal-receipt"><div class="receipt-title">POS Receipt - Offline Queued</div><div class="receipt-meta"><div><span>Terminal Inv</span><strong>${esc(posInvoice||terminalInvoiceId)}</strong></div><div><span>FBR Status</span><strong>Awaiting internet availability</strong></div><div><span>FBR Invoice No</span><strong>Pending</strong></div><div><span>FBR Response</span><strong>Will submit automatically when ERPNext is online</strong></div></div></div></body></html>`;
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
  cartLines=[];selectedCartIndex=-1;paymentRows=[];appliedBenefits=emptyBenefits();changeDue=0;
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
      itemCount:cartLines.length,estimatedTotal:totals.grandTotal
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
  appliedBenefits=normalizeBenefits(benefits);
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
// Short-lived cache so the badge check (Sales History) and opening the refund
// screen for the same invoice a moment later don't both hit the server for
// identical data. Deliberately NOT used by submitRefund's pre-submit re-verify,
// which is a race guard against another refund landing in between and must
// always be a fresh fetch.
const refundInvoiceCache = new Map<string, { data: Record<string, unknown> | null; error: string | null; fetchedAt: number }>();
const REFUND_INVOICE_CACHE_TTL_MS = 30_000;
async function getInvoiceForRefundCached(invoice: string): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const cached = refundInvoiceCache.get(invoice);
  if (cached && Date.now() - cached.fetchedAt < REFUND_INVOICE_CACHE_TTL_MS) return cached;
  const result = await window.posAPI.getInvoiceForRefund(invoice).catch(() => ({ data: null, error: "" }));
  refundInvoiceCache.set(invoice, { ...result, fetchedAt: Date.now() });
  return result;
}
async function loadRefundHistoryStatuses(rows:SalesHistoryRow[]):Promise<Map<string,RefundHistoryStatus>>{
  const statuses=new Map<string,RefundHistoryStatus>();
  if(!isOnline())return statuses;
  const invoices=[...new Set(rows.filter((row)=>row.posInvoice&&row.status==="Submitted").map((row)=>row.posInvoice as string))];
  await Promise.all(invoices.map(async(invoice)=>{
    const result=await getInvoiceForRefundCached(invoice);
    statuses.set(invoice,classifyRefundHistory(result.data));
  }));
  return statuses;
}
function buildHistoryRow(row:SalesHistoryRow,refundStatus:RefundHistoryStatus|undefined,checking:boolean):HTMLElement{
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
  if(refundStatus==="partial"||refundStatus==="complete"){
    const refundTag=document.createElement("span");
    refundTag.className=`fbr-tag ${refundStatus==="complete"?"return":"warn"}`;
    refundTag.textContent=refundStatus==="complete"?"Completely refunded":"Partially refunded";
    main.append(refundTag);
  }else if(checking&&row.posInvoice&&row.status==="Submitted"){
    const checkingTag=document.createElement("span");checkingTag.className="fbr-tag";checkingTag.textContent="Checking refund status…";
    main.append(checkingTag);
  }
  const actions=document.createElement("div");actions.className="op-card-actions";
  const view=document.createElement("button");view.type="button";view.className="secondary-button";view.textContent="View Receipt";view.onclick=()=>void viewHistoryReceipt(row);
  const dup=document.createElement("button");dup.type="button";dup.textContent="Print Duplicate";dup.disabled=!row.posInvoice;dup.onclick=()=>void printDuplicate(row);
  const refund=document.createElement("button");refund.type="button";refund.className="secondary-button";refund.textContent=refundStatus==="complete"?"Refunded":"Refund";
  const canRefund=Boolean(cashierSession?.canRefund);
  refund.disabled=!row.posInvoice||row.status!=="Submitted"||refundStatus==="complete"||!canRefund;
  refund.title=canRefund?"":"This cashier is not allowed to refund.";
  refund.onclick=()=>void openRefund(row.posInvoice??"");
  actions.append(view,dup,refund);
  card.append(main,actions);return card;
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
  if(msg)msg.textContent="";
  if(!rows.length){list.replaceChildren(Object.assign(document.createElement("div"),{className:"op-empty",textContent:"No matching sales."}));return;}
  // Render immediately without waiting on refund-status checks (up to ~50 parallel
  // network calls) — the cashier can view/act on the list right away. Refund badges
  // patch in once the background check resolves, instead of blocking the whole list.
  const renderToken=++salesHistoryRenderToken;
  const online=isOnline();
  list.replaceChildren(...rows.map((row)=>buildHistoryRow(row,undefined,online)));
  if(!online)return;
  const refundStatuses=await loadRefundHistoryStatuses(rows);
  if(renderToken!==salesHistoryRenderToken)return; // a newer search/filter already superseded this one
  list.replaceChildren(...rows.map((row)=>buildHistoryRow(row,row.posInvoice?refundStatuses.get(row.posInvoice):undefined,false)));
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
  if(!cashierSession){const hm=document.querySelector<HTMLElement>("#history-message");if(hm)hm.textContent="Cashier login required.";await showCashierLogin("Cashier login required.");return;}
  if(!cashierSession.canRefund){const hm=document.querySelector<HTMLElement>("#history-message");if(hm)hm.textContent="This cashier is not allowed to refund.";return;}
  if(cashierSession?.offlineLogin){const hm=document.querySelector<HTMLElement>("#history-message");if(hm)hm.textContent="Refund requires online cashier login.";return;}
  if(!isOnline()){const hm=document.querySelector<HTMLElement>("#history-message");if(hm)hm.textContent="Online connection required for refunds.";return;}
  const hm=document.querySelector<HTMLElement>("#history-message");if(hm)hm.textContent="Loading invoice…";
  const result=await getInvoiceForRefundCached(posInvoice);
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
  if(!cashierSession){if(msg)msg.textContent="Cashier login required.";return;}
  if(!cashierSession.canRefund){if(msg)msg.textContent="This cashier is not allowed to refund.";return;}
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
  const totalQty=items.reduce((sum,it)=>sum+it.qty,0);
  if(!appConfirm(`Refund ${totalQty} item(s) from ${String(refundData.original_invoice??"")}?`))return;
  await verifyAndSubmitRefund(items,mode,reason,false);
}

// Split out from submitRefund so the quantity-conflict path can retry once with
// server-corrected quantities without re-scraping the DOM (which renderRefundScreen
// has already reset to reflect the fresh remaining amounts, not the cashier's
// original request) and without re-showing the confirm dialog a second time.
async function verifyAndSubmitRefund(items:{original_row_name:string;qty:number}[],mode:string,reason:string,isRetry:boolean):Promise<void>{
  if(!cashierSession||!refundData)return;
  const msg=document.querySelector<HTMLElement>("#refund-message");
  const btn=document.querySelector<HTMLButtonElement>("#refund-submit");if(btn)btn.disabled=true;
  // Re-fetch authoritative remaining quantities and block if another refund reduced availability.
  // Deliberately NOT the cached getInvoiceForRefundCached — this is a race guard and must be fresh.
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
      return;
    }
    if(!isRetry){
      // Auto-correct to the fresh remaining quantities and retry once, instead of
      // leaving the cashier to notice the message and resubmit manually.
      const correctedItems=items
        .map((it)=>({original_row_name:it.original_row_name,qty:Math.min(it.qty,freshRemaining.get(it.original_row_name)??0)}))
        .filter((it)=>it.qty>0.0001);
      if(!correctedItems.length){if(msg)msg.textContent="Available quantity changed — nothing left to refund on the requested rows.";if(btn)btn.disabled=false;return;}
      if(msg)msg.textContent="Available quantity changed — retrying with corrected quantities…";
      await verifyAndSubmitRefund(correctedItems,mode,reason,true);
      return;
    }
    if(msg)msg.textContent="Available quantity changed again — please review and submit manually.";
    if(btn)btn.disabled=false;
    return;
  }
  refundSubmitting=true;if(msg)msg.textContent="Submitting Refund…";
  // terminal_refund_id is NOT regenerated on retry — idempotency is server-enforced.
  const payload={terminal_refund_id:refundTerminalId,original_invoice:refundData.original_invoice,pos_opening_entry:sessionState.openingEntry,cashier_user:cashierSession.user,cashier_full_name:cashierSession.fullName||cashierSession.user,offline_authenticated:false,offline_auth_method:"",local_offline_session_id:"",reason,items,payments:[{mode_of_payment:mode,amount:0}]};
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

async function loadCustomerBenefits():Promise<void>{
  if(!selectedCustomer)return;
  if(!isOnline()){customerBenefits={loyaltyProgram:"",availablePoints:0,conversionFactor:1};customerGiftVouchers=[];return;}
  try{
    const [result,vouchers]=await Promise.all([
      window.posAPI.getCustomerBenefits(selectedCustomer.name),
      window.posAPI.listCustomerGiftVouchers(selectedCustomer.name).catch(()=>({vouchers:[],error:null}))
    ]);
    customerBenefits={loyaltyProgram:result.loyaltyProgram??"",availablePoints:result.availablePoints,conversionFactor:result.conversionFactor};
    customerGiftVouchers=vouchers.vouchers??[];
  }catch{customerBenefits={loyaltyProgram:"",availablePoints:0,conversionFactor:1};customerGiftVouchers=[];}
}

function giftVoucherLabel(voucher: GiftVoucher): string {
  const code = String(voucher.voucher_code ?? voucher.name ?? "");
  const amount = Number(voucher.amount) || 0;
  const expiry = voucher.expiry_date ? ` | Exp ${voucher.expiry_date}` : "";
  const branch = voucher.branch ? ` | ${voucher.branch}` : "";
  return `${code} | ${amount.toFixed(2)}${expiry}${branch}`;
}

function renderGiftVoucherList(): void {
  const list = document.querySelector<HTMLElement>("#benefits-gift-voucher-list");
  if (!list) return;
  if (!customerGiftVouchers.length) {
    const empty = document.createElement("p");
    empty.className = "card-meta";
    empty.textContent = isOnline() ? "No active gift vouchers for this customer." : "";
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...customerGiftVouchers.map((voucher) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button search-result";
    button.textContent = giftVoucherLabel(voucher);
    button.onclick = () => {
      const input = document.querySelector<HTMLInputElement>("#benefits-gift-voucher-code");
      if (input) { input.value = String(voucher.voucher_code ?? voucher.name ?? ""); input.focus(); }
    };
    return button;
  }));
}

async function renderBenefits():Promise<void>{const dialog=document.querySelector<HTMLDialogElement>("#benefits-dialog");if(!dialog)return;const online=isOnline();const customerNameElem=document.querySelector<HTMLElement>("#benefits-customer");if(customerNameElem)customerNameElem.textContent=selectedCustomer?.customer_name??"—";const offlineMsg=document.querySelector<HTMLElement>("#benefits-offline-message");if(offlineMsg)offlineMsg.hidden=online;const loyaltySection=document.querySelector<HTMLElement>("#benefits-loyalty-section");const voucherSection=document.querySelector<HTMLElement>("#benefits-voucher-section");if(loyaltySection)loyaltySection.style.pointerEvents=online?"auto":"none";if(voucherSection)voucherSection.style.pointerEvents=online?"auto":"none";const programElem=document.querySelector<HTMLElement>("#benefits-loyalty-program");if(programElem)programElem.textContent=customerBenefits.loyaltyProgram||"—";const pointsElem=document.querySelector<HTMLElement>("#benefits-available-points");if(pointsElem)pointsElem.textContent=String(customerBenefits.availablePoints);const conversionElem=document.querySelector<HTMLElement>("#benefits-conversion-factor");if(conversionElem)conversionElem.textContent=String(customerBenefits.conversionFactor);const redeemInput=document.querySelector<HTMLInputElement>("#benefits-redeem-points");const maxBtn=document.querySelector<HTMLButtonElement>("#benefits-max-points");const couponInput=document.querySelector<HTMLInputElement>("#benefits-coupon-code");const applyBtn=document.querySelector<HTMLButtonElement>("#benefits-apply");const removeBtn=document.querySelector<HTMLButtonElement>("#benefits-remove");if(redeemInput){redeemInput.disabled=!online||!customerBenefits.loyaltyProgram;}if(maxBtn){maxBtn.disabled=!online||!customerBenefits.loyaltyProgram;}if(couponInput){couponInput.disabled=!online;}if(applyBtn){applyBtn.disabled=!online;}if(removeBtn){removeBtn.disabled=appliedBenefits.loyaltyPoints===0&&!appliedBenefits.couponCode;}const loyaltyValue=customerBenefits.conversionFactor>0?customerBenefits.availablePoints/customerBenefits.conversionFactor:0;const loyaltyElem=document.querySelector<HTMLElement>("#benefits-loyalty-value");if(loyaltyElem)loyaltyElem.textContent=loyaltyValue.toFixed(2); const redeemedPts=previewNumber(serverTotals,"redeemed_loyalty_points");const loyaltyAmt=previewNumber(serverTotals,"loyalty_amount"); const redeemedRow=document.querySelector<HTMLElement>("#benefits-redeemed-row");if(redeemedRow)redeemedRow.hidden=redeemedPts===null||redeemedPts===0; const redeemedElem=document.querySelector<HTMLElement>("#benefits-redeemed-points");if(redeemedElem)redeemedElem.textContent=redeemedPts!==null?String(redeemedPts):"0"; const loyaltyAmtRow=document.querySelector<HTMLElement>("#benefits-loyalty-amount-row");if(loyaltyAmtRow)loyaltyAmtRow.hidden=loyaltyAmt===null||loyaltyAmt===0; const loyaltyAmtElem=document.querySelector<HTMLElement>("#benefits-loyalty-amount");if(loyaltyAmtElem)loyaltyAmtElem.textContent=loyaltyAmt!==null?loyaltyAmt.toFixed(2):"0.00"; const appliedElem=document.querySelector<HTMLElement>("#benefits-applied");if(appliedElem){const parts:string[]=[];if(appliedBenefits.loyaltyPoints>0)parts.push(`Loyalty: ${appliedBenefits.loyaltyPoints} pts`);if(appliedBenefits.couponCode)parts.push(`Coupon: ${appliedBenefits.couponCode}`);appliedElem.textContent=parts.length?`Applied: ${parts.join(" + ")}`:"";}dialog.showModal();window.setTimeout(()=>document.querySelector<HTMLInputElement>("#benefits-redeem-points")?.focus(),0);}

async function applyBenefits():Promise<void>{const msg=document.querySelector<HTMLElement>("#benefits-message");try{const redeemInput=document.querySelector<HTMLInputElement>("#benefits-redeem-points");const couponInput=document.querySelector<HTMLInputElement>("#benefits-coupon-code");const redeemPoints=Number(redeemInput?.value)||0;const couponCode=(couponInput?.value??"").trim();if(redeemPoints>0&&redeemPoints>customerBenefits.availablePoints){if(msg)msg.textContent="Redeem points exceeds available points.";return;}appliedBenefits={loyaltyPoints:redeemPoints,couponCode:couponCode};await saveBenefitsDraft();if(msg)msg.textContent="Benefits applied — validating with server…";benefitsOutdated=false;if(paymentRows.length)paymentsOutdated=true;scheduleCartPreview();await renderBenefits();}catch(err){if(msg)msg.textContent=err instanceof Error?err.message:"Failed to apply benefits.";}}

async function removeBenefits():Promise<void>{appliedBenefits={loyaltyPoints:0,couponCode:""};await saveBenefitsDraft();const msg=document.querySelector<HTMLElement>("#benefits-message");if(msg)msg.textContent="Benefits removed.";if(paymentRows.length)paymentsOutdated=true;scheduleCartPreview();await renderBenefits();}

async function saveBenefitsDraft():Promise<void>{const draft:AppliedBenefits={...appliedBenefits,cartKey:cartLines.map(l=>l.itemCode).join("|")+"|"+cartLines.map(l=>l.quantity).join("|")};await window.posAPI.saveBenefitsDraft(draft);}

async function openBenefits():Promise<void>{await loadCustomerBenefits();appliedBenefits=await window.posAPI.loadBenefitsDraft()??{loyaltyPoints:0,couponCode:""};const redeemInput=document.querySelector<HTMLInputElement>("#benefits-redeem-points");if(redeemInput)redeemInput.value=String(appliedBenefits.loyaltyPoints);const couponInput=document.querySelector<HTMLInputElement>("#benefits-coupon-code");if(couponInput)couponInput.value=appliedBenefits.couponCode;await renderBenefits();}

async function renderBenefitsModern():Promise<void>{
  const dialog=document.querySelector<HTMLDialogElement>("#benefits-dialog");if(!dialog)return;
  const online=isOnline();
  const customerNameElem=document.querySelector<HTMLElement>("#benefits-customer");if(customerNameElem)customerNameElem.textContent=selectedCustomer?.customer_name??"â€”";
  const offlineMsg=document.querySelector<HTMLElement>("#benefits-offline-message");if(offlineMsg)offlineMsg.hidden=online;
  const loyaltySection=document.querySelector<HTMLElement>("#benefits-loyalty-section");const voucherSection=document.querySelector<HTMLElement>("#benefits-voucher-section");
  if(loyaltySection)loyaltySection.style.pointerEvents=online?"auto":"none";if(voucherSection)voucherSection.style.pointerEvents=online?"auto":"none";
  const programElem=document.querySelector<HTMLElement>("#benefits-loyalty-program");if(programElem)programElem.textContent=customerBenefits.loyaltyProgram||"â€”";
  const pointsElem=document.querySelector<HTMLElement>("#benefits-available-points");if(pointsElem)pointsElem.textContent=String(customerBenefits.availablePoints);
  const conversionElem=document.querySelector<HTMLElement>("#benefits-conversion-factor");if(conversionElem)conversionElem.textContent=String(customerBenefits.conversionFactor);
  const redeemInput=document.querySelector<HTMLInputElement>("#benefits-redeem-points");const maxBtn=document.querySelector<HTMLButtonElement>("#benefits-max-points");
  const couponInput=document.querySelector<HTMLInputElement>("#benefits-coupon-code");const giftInput=document.querySelector<HTMLInputElement>("#benefits-gift-voucher-code");
  const applyBtn=document.querySelector<HTMLButtonElement>("#benefits-apply");const removeBtn=document.querySelector<HTMLButtonElement>("#benefits-remove");
  if(redeemInput){redeemInput.disabled=!online||!customerBenefits.loyaltyProgram;}if(maxBtn){maxBtn.disabled=!online||!customerBenefits.loyaltyProgram;}
  if(couponInput){couponInput.disabled=!online;}if(giftInput){giftInput.disabled=!online;}if(applyBtn){applyBtn.disabled=!online;}
  if(removeBtn){removeBtn.disabled=appliedBenefits.loyaltyPoints===0&&!appliedBenefits.couponCode&&!appliedBenefits.giftVoucherCode;}
  const loyaltyValue=customerBenefits.conversionFactor>0?customerBenefits.availablePoints/customerBenefits.conversionFactor:0;const loyaltyElem=document.querySelector<HTMLElement>("#benefits-loyalty-value");if(loyaltyElem)loyaltyElem.textContent=loyaltyValue.toFixed(2);
  const redeemedPts=previewNumber(serverTotals,"redeemed_loyalty_points");const loyaltyAmt=previewNumber(serverTotals,"loyalty_amount");
  const redeemedRow=document.querySelector<HTMLElement>("#benefits-redeemed-row");if(redeemedRow)redeemedRow.hidden=redeemedPts===null||redeemedPts===0;
  const redeemedElem=document.querySelector<HTMLElement>("#benefits-redeemed-points");if(redeemedElem)redeemedElem.textContent=redeemedPts!==null?String(redeemedPts):"0";
  const loyaltyAmtRow=document.querySelector<HTMLElement>("#benefits-loyalty-amount-row");if(loyaltyAmtRow)loyaltyAmtRow.hidden=loyaltyAmt===null||loyaltyAmt===0;
  const loyaltyAmtElem=document.querySelector<HTMLElement>("#benefits-loyalty-amount");if(loyaltyAmtElem)loyaltyAmtElem.textContent=loyaltyAmt!==null?loyaltyAmt.toFixed(2):"0.00";
  renderGiftVoucherList();
  const totals=fbrTotalsView();
  const giftStatus=document.querySelector<HTMLElement>("#benefits-gift-voucher-status");if(giftStatus)giftStatus.textContent=appliedBenefits.giftVoucherCode?(totals.giftVoucherError||`Gift voucher amount: ${totals.giftVoucherAmount.toFixed(2)}`):"";
  const appliedElem=document.querySelector<HTMLElement>("#benefits-applied");
  if(appliedElem){const parts:string[]=[];if(appliedBenefits.loyaltyPoints>0)parts.push(`Loyalty: ${appliedBenefits.loyaltyPoints} pts`);if(appliedBenefits.couponCode)parts.push(`Coupon: ${appliedBenefits.couponCode}`);if(appliedBenefits.giftVoucherCode)parts.push(`Gift Voucher: ${appliedBenefits.giftVoucherCode}`);appliedElem.textContent=parts.length?`Applied: ${parts.join(" + ")}`:"";}
  dialog.showModal();window.setTimeout(()=>document.querySelector<HTMLInputElement>("#benefits-redeem-points")?.focus(),0);
}

async function applyBenefitsModern():Promise<void>{
  const msg=document.querySelector<HTMLElement>("#benefits-message");
  try{
    const redeemInput=document.querySelector<HTMLInputElement>("#benefits-redeem-points");const couponInput=document.querySelector<HTMLInputElement>("#benefits-coupon-code");const giftInput=document.querySelector<HTMLInputElement>("#benefits-gift-voucher-code");
    const redeemPoints=Number(redeemInput?.value)||0;const couponCode=(couponInput?.value??"").trim();const giftVoucherCode=(giftInput?.value??"").trim();
    if(redeemPoints>0&&redeemPoints>customerBenefits.availablePoints){if(msg)msg.textContent="Redeem points exceeds available points.";return;}
    if(giftVoucherCode&&selectedCustomer){const validation=await window.posAPI.validateGiftVoucherCode(giftVoucherCode,selectedCustomer.name);if(msg)msg.textContent=validation.error??"Gift voucher validated.";}
    appliedBenefits={loyaltyPoints:redeemPoints,couponCode,giftVoucherCode};await saveBenefitsDraft();
    if(msg)msg.textContent=giftVoucherCode?"Benefits applied - validating voucher with cart...":"Benefits applied - validating with server...";
    benefitsOutdated=false;if(paymentRows.length)paymentsOutdated=true;scheduleCartPreview();await renderBenefitsModern();
  }catch(err){if(msg)msg.textContent=err instanceof Error?err.message:"Failed to apply benefits.";}
}

async function removeBenefitsModern():Promise<void>{appliedBenefits=emptyBenefits();await saveBenefitsDraft();const msg=document.querySelector<HTMLElement>("#benefits-message");if(msg)msg.textContent="Benefits removed.";if(paymentRows.length)paymentsOutdated=true;scheduleCartPreview();await renderBenefitsModern();}

async function openBenefitsModern():Promise<void>{
  await loadCustomerBenefits();
  appliedBenefits=normalizeBenefits(await window.posAPI.loadBenefitsDraft());
  const redeemInput=document.querySelector<HTMLInputElement>("#benefits-redeem-points");if(redeemInput)redeemInput.value=String(appliedBenefits.loyaltyPoints);
  const couponInput=document.querySelector<HTMLInputElement>("#benefits-coupon-code");if(couponInput)couponInput.value=appliedBenefits.couponCode;
  const giftInput=document.querySelector<HTMLInputElement>("#benefits-gift-voucher-code");if(giftInput)giftInput.value=appliedBenefits.giftVoucherCode??"";
  await renderBenefitsModern();
}

function closeBenefitsDialog():void{document.querySelector<HTMLDialogElement>('#benefits-dialog')?.close();focusCart();}

// Cash is the most common tender at retail, so pin it first regardless of its
// position in the POS Profile's payments child table - rest stays server-order.
function sortPaymentMethodsCashFirst(methods: string[]): string[] {
  const cashIndex = methods.findIndex((m) => m.toLowerCase() === "cash");
  if (cashIndex <= 0) return methods;
  const copy = methods.slice();
  const [cash] = copy.splice(cashIndex, 1);
  copy.unshift(cash);
  return copy;
}

function renderPaymentMethods():void{const box=document.querySelector<HTMLElement>("#payment-methods");if(!box)return;box.replaceChildren(...paymentMethods.map((m,i)=>{const b=document.createElement("button");b.type="button";b.className=`secondary-button search-result${i===selectedPaymentMethodIndex?" selected":""}`;if(i<9){const key=document.createElement("span");key.className="payment-method-key";key.textContent=String(i+1);b.append(key);}b.append(document.createTextNode(m));b.onclick=()=>{selectedPaymentMethodIndex=i;renderPaymentMethods();document.querySelector<HTMLInputElement>("#payment-amount")?.focus();};return b;}));}
async function openPayment():Promise<void>{
  // F6 gate: validate the POS session, then require the current cart version to be server-validated.
  if(!cashierSession){cartMessage("Cashier login required.");await showCashierLogin("Cashier login required.");return;}
  let online=isOnline();
  if(online&&cashierSession.offlineLogin){cartMessage("Online cashier login required for live sales.");await showCashierLogin("Internet is online. Login with ERPNext cashier password to continue live sales.");return;}
  if(online&&shiftClosed){cartMessage("Shift is closed — start a new shift");return;}
  if(!cartLines.length){cartMessage("Cart is empty");return;}
  if(online){
    if(!(await validateSession("pay"))){
      const reachability=await window.posAPI.testServer().catch(()=>({connected:false}));
      if(!reachability.connected){
        const status=document.querySelector<HTMLElement>("#pos-server-status"); if(status)status.textContent="Offline";
        setOnlineIndicator(false); showServerStatus(false); await updateOfflineUi(); online=false;
      }else{
        showSessionInvalid(sessionState.reason);return;
      }
    }
    if(isPreviousDateSession()){cartMessage("Shift was opened on a previous date. Close shift before new sales.");return;}
  }
  if(online){
    if(validatedCartVersion!==currentCartVersion&&!activePreviewPromise)scheduleCartPreview();
    const pending=activePreviewPromise; // wait for the current validation if one is running
    if(pending){showPreviewStatus("Validating…");await pending;}
    if(validatedCartVersion!==currentCartVersion){cartMessage(previewError?`Cannot open payment — ${previewError}`:"Cart is not server validated yet");return;}
  }else{
    if(!cashierSession.offlineLogin){
      cartMessage("Offline sale requires cashier PIN login.");
      await showCashierLogin("Enter cashier username and offline PIN before selling offline.");
      return;
    }
    if(validatedCartVersion!==currentCartVersion&&!activePreviewPromise)scheduleCartPreview();
    if(activePreviewPromise)await activePreviewPromise;
    const blocker=await offlineLocalBlocker(false);
    if(blocker){cartMessage(blocker);return;}
  }
  if(paymentsOutdated&&paymentRows.length){if(!appConfirm("Cart changed. Clear outdated payments?"))return;paymentRows=[];await persistPayments();paymentsOutdated=false;}paymentMethods=sortPaymentMethodsCashFirst(await window.posAPI.getPaymentMethods());paymentRows=await window.posAPI.loadPaymentDraft();changeDue=0;selectedPaymentMethodIndex=0;
  // A row left mid-"Edit" from a previous open of this dialog (e.g. the cashier
  // went back to add more items instead of finishing the edit) must not survive
  // into this fresh session — addPayment() would otherwise silently overwrite
  // that stale row instead of adding a new payment.
  paymentEditIndex=null;
  renderPaymentMethods();const amountInput=document.querySelector<HTMLInputElement>("#payment-amount");if(amountInput)amountInput.value="";const payMsg=document.querySelector<HTMLElement>("#payment-message");if(payMsg)payMsg.textContent="";renderPayments();document.querySelector<HTMLDialogElement>("#payment-dialog")?.showModal();window.setTimeout(()=>amountInput?.focus(),0);}
function renderCart(): void {
  const container = document.querySelector<HTMLElement>("#cart-rows"); if (!container) return; container.replaceChildren();
  cartLines.forEach((line, index) => { const row = document.createElement("div"); row.setAttribute("role", "button"); row.setAttribute("aria-label", `${line.itemName}, quantity ${line.quantity}, line total ${((line.sellingPrice ?? 0) * line.quantity).toFixed(2)}`); row.tabIndex = -1; const lowStock=line.actualStock !== null&&line.actualStock!==undefined&&line.quantity>line.actualStock; row.className = `cart-row${index === selectedCartIndex ? " selected" : ""}${lowStock?" stock-warning":""}`; const cells = [line.itemCode,line.itemName,line.uom,String(line.quantity),String(line.sellingPrice ?? 0),"0.00",((line.sellingPrice ?? 0) * line.quantity).toFixed(2),`${line.actualStock ?? "—"}${lowStock ? " ⚠" : ""}`,"Remove"]; cells.forEach((text,cellIndex) => { const cell=document.createElement("span");cell.textContent=text;if(cellIndex===7&&lowStock)cell.title="Requested quantity exceeds displayed stock";row.append(cell); }); row.onpointerdown = (event) => event.preventDefault(); row.onclick = () => { selectedCartIndex = index; renderCart(); focusCart(true); }; container.append(row); });
  // Keep the most recently scanned/selected line in view automatically -
  // cashiers on a compact 19" screen shouldn't have to scroll the cart list
  // by hand to see what was just rung up.
  if (selectedCartIndex >= 0) (container.children[selectedCartIndex] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  const quantity = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const totals = fbrTotalsView();
  const paid = paymentRows.reduce((sum, row) => sum + row.amount, 0);
  (document.querySelector("#cart-item-count") as HTMLElement).textContent = String(cartLines.length);
  (document.querySelector("#cart-quantity") as HTMLElement).textContent = String(quantity);
  setCartText("#mobile-tab-count", String(cartLines.length));
  setCartText("#mobile-cart-count", `${quantity} item${quantity===1?"":"s"}`);
  setCartText("#mobile-cart-total", totals.grandTotal.toFixed(2));
  setCartText("#cart-sales-tax", totals.salesTax.toFixed(2));
  setCartText("#cart-service-fee", totals.serviceFee.toFixed(2));
  setCartText("#cart-grand-total", totals.grandTotal.toFixed(2)); // invoice grand total, before loyalty/voucher settlement
  setCartText("#cart-paid", paid.toFixed(2));
  setCartText("#cart-change", changeDue.toFixed(2));
  // Display loyalty redemption and coupon
  const loyaltyDisplayEl=document.querySelector<HTMLElement>("#cart-loyalty-display");
  if(loyaltyDisplayEl){loyaltyDisplayEl.textContent=appliedBenefits.loyaltyPoints>0?`Loyalty Redeemed: ${appliedBenefits.loyaltyPoints} pts (${totals.loyaltyAmount.toFixed(2)})`:"";}
  const couponDisplayEl=document.querySelector<HTMLElement>("#cart-coupon-display");
  if(couponDisplayEl){couponDisplayEl.textContent=appliedBenefits.couponCode?`Coupon: ${appliedBenefits.couponCode}`:"";}
  const giftVoucherDisplayEl=document.querySelector<HTMLElement>("#cart-gift-voucher-display");
  if(giftVoucherDisplayEl){
    giftVoucherDisplayEl.textContent=appliedBenefits.giftVoucherCode
      ? (totals.giftVoucherError ? `Gift Voucher: ${appliedBenefits.giftVoucherCode} - ${totals.giftVoucherError}` : `Gift Voucher: ${appliedBenefits.giftVoucherCode} (${totals.giftVoucherAmount.toFixed(2)})`)
      : "";
  }
  updateCompleteSaleState();
  pushCustomerDisplayUpdate(totals);
}
// Broadcasts the same lines/total the cashier's own screen just rendered to the
// (optional, dual-monitor) customer-facing display window — reuses whatever
// renderCart() already computed rather than recalculating pricing separately,
// so the two screens can never show different numbers.
function pushCustomerDisplayUpdate(totals: FbrTotalsView): void {
  const lines = cartLines.map((line) => ({
    itemName: line.itemName,
    quantity: line.quantity,
    rate: line.sellingPrice ?? 0,
    amount: (line.sellingPrice ?? 0) * line.quantity
  }));
  // MRP (pos_fbr_item_config.custom_mrp, synced for FBR Third Schedule tax
  // purposes) doubles as a "you saved X" figure whenever it's above the
  // actual selling price — a nice, reassuring thing to show a waiting
  // customer, not just tax plumbing.
  const totalSavings = cartLines.reduce((sum, line) => {
    const mrp = line.mrp ?? 0;
    const rate = line.sellingPrice ?? 0;
    return mrp > rate ? sum + (mrp - rate) * line.quantity : sum;
  }, 0);
  window.posAPI.pushCustomerDisplay({
    lines,
    itemCount: cartLines.length,
    grandTotal: totals.grandTotal,
    totalSavings,
    customerName: selectedCustomer?.customer_name || selectedCustomer?.name || "",
    companyName: sessionState.company || ""
  });
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
    appliedBenefits = emptyBenefits();
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
  const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function isPreviousDateSession(): boolean {
  const openedDate = dateOnly(sessionState.periodStart || sessionState.postingDate);
  return Boolean(sessionState.valid && openedDate && openedDate !== todayLocalDate());
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
    const stale = isPreviousDateSession();
    warning.hidden = !stale;
    if (stale) warning.textContent = "Shift was opened on a previous date. Close it before new sales.";
  }
}
function applySessionToHeader(): void {
  setCartText("#session-opening-entry", !isOnline() && !sessionState.openingEntry ? "Offline Session — Sales Queued" : (sessionState.openingEntry || "No active POS Opening Entry"));
  if (sessionState.user) setCartText("#session-user", sessionState.user);
  updatePosHeader();
  const sync = document.querySelector<HTMLElement>("#pos-sync-status"); if (sync) sync.textContent = !isOnline() ? "Offline Session — Sales Queued" : (sessionState.valid ? "Ready" : "Session Invalid");
  refreshHeaderStatusBadges();
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
  if (!cashierSession) return failSession("Cashier login required.");
  const result = await window.posAPI.getActivePosSession(cashierRequest());
  showSessionDiagnostics(result);
  if (result.apiUser) authenticatedUser = result.apiUser;
  const selectedProfile = document.querySelector<HTMLSelectElement>("#pos-profile")?.value || sessionState.posProfile;
  const session = result.session && typeof result.session === "object"
    ? result.session as Record<string, unknown>
    : matchingSessionEntry(result.entries, selectedProfile, cashierSession.user);
  if (!session) {
    sessionHasEntry = false;
    const fallback = result.diagnosticReason || result.error || "No active POS Opening Entry";
    return failSession(activeEntriesReason(result.entries, selectedProfile, cashierSession.user, fallback));
  }
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
  if (cashierSession && user && !sameUser(user, cashierSession.user)) return failSession(`Active shift belongs to ${user}, not ${cashierSession.user}.`);
  if (selectedCompany && company && company !== selectedCompany) return failSession(`Active shift company ${company} does not match ${selectedCompany}`);
  if (sessionState.openingEntry && name !== sessionState.openingEntry) {
    // A different open entry is returned — never switch silently.
    if (cartLines.length) return failSession(`A different shift (${name}) is active. Confirm to switch.`, name);
    if (!appConfirm(`A different shift (${name}) is active. Switch to it?`)) return failSession(`A different shift (${name}) is active`, name);
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
  if (cartLines.length && !appConfirm("Switching shifts keeps the current cart, customer and payment. Continue?")) return;
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
  if (!cashierSession) { await showCashierLogin("Cashier login required."); return; }
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
    const missingAuthentication = isCapacitorRuntime() ? false : (!saved.apiKey || !saved.hasApiSecret);
    if (!saved.erpnextUrl || missingAuthentication || !saved.posProfile) {
      setStep("settings", "failed"); setOverallBadge("Setup Required", "warn");
      if (progress) progress.textContent = "Terminal settings required"; showSettingsMessage(isCapacitorRuntime() ? "Enroll this Android device for a POS Profile." : "Enter ERPNext URL, API Key/Secret and select a POS Profile, then Save and Complete Setup."); showScreen("settings"); return;
    }
    setStep("settings", "complete");
    // 2) Server (silent)
    setStep("server", "running"); if (progress) progress.textContent = "Testing server…";
    const server = await window.posAPI.testServer(); setOnlineIndicator(server.connected);
    if (!server.connected) {
      setStep("server", "warning"); if (serverStatus) serverStatus.textContent = "Offline"; prevServerConnected = false; showServerStatus(false);
      const cachedCfg = await window.posAPI.getCachedPosConfiguration();
      if (cachedCfg) {
        showPosConfigurationSummary(cachedCfg); await loadCachedPosSession(); updatePosHeader();
        ["config", "catalogue", "customers", "fbr", "session"].forEach((s) => setStep(s as SetupStep, "warning"));
        if (cashierSession) {
          await seedSessionFromCache();
          await seedDefaultCustomerFromConfig(cachedCfg);
          setOverallBadge("Ready Using Cached Data", "warn"); if (progress) progress.textContent = "Offline — using cached data";
          setupCompleted = true; void renderSyncStatus(); void updateOfflineUi(); showScreen("pos"); return;
        }
      }
      setOverallBadge("Cashier Login Required", "warn"); if (progress) progress.textContent = "Offline cashier login required"; await showCashierLogin("Enter cashier username and offline PIN."); return;
    }
    setStep("server", "complete"); if (serverStatus) serverStatus.textContent = "Online"; prevServerConnected = true; showServerStatus(true);
    // 3) Authenticate
    setStep("auth", "running"); if (progress) progress.textContent = "Authenticating…";
    const login = await window.posAPI.testLogin();
    if (!login.success) {
      if (isCapacitorRuntime()) { setStep("auth", "pending"); setOverallBadge("Cashier Login Required", "info"); if (progress) progress.textContent = "Cashier login required"; await showCashierLogin("Sign in securely with ERPNext."); return; }
      setStep("auth", "failed"); setOverallBadge("Action Required", "err"); if (progress) progress.textContent = "Authentication failed"; showSettingsMessage("Authentication failed. The API key or secret is invalid."); showLoginResult("Authentication failed — check API Key/Secret."); showScreen("settings"); return;
    }
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
    if (!cashierSession) {
      setOverallBadge("Cashier Login Required", "info"); if (progress) progress.textContent = "Cashier login required";
      await showCashierLogin("Enter ERPNext cashier credentials.");
      return;
    }
    // 6) Session
    setStep("session", "running"); if (progress) progress.textContent = "Validating session…";
    const ok = await validateSession("startup");
    updatePosHeader(); setupCompleted = true;
    void markDataAvailabilityFromCache(); startBackgroundSync(); void renderSyncStatus();
    if (ok) { setStep("session", isPreviousDateSession() ? "warning" : "complete"); setOverallBadge(isPreviousDateSession() ? "Close Previous Shift" : "POS Ready", isPreviousDateSession() ? "warn" : "ok"); if (progress) progress.textContent = isPreviousDateSession() ? "Previous date shift is still open" : "Ready"; showScreen("pos"); }
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
    warehouse: document.querySelector<HTMLInputElement>("#warehouse")?.value ?? "",
    receiptPrinter: document.querySelector<HTMLSelectElement>("#receipt-printer")?.value ?? "",
    colorTheme: document.querySelector<HTMLSelectElement>("#color-theme")?.value ?? "warm-market"
  };
}

function applyColorTheme(theme: string): void {
  document.documentElement.dataset.theme = theme || "warm-market";
}

// Local system printers (no server round-trip) - repopulated whenever the
// Settings screen loads so a newly-attached printer shows up without
// restarting the app. Keeps whatever was already selected/saved even if the
// printer is temporarily offline/not enumerated (rather than silently
// resetting to "System Default" and losing the saved choice).
async function populatePrinterDropdown(savedValue: string): Promise<void> {
  const select = document.querySelector<HTMLSelectElement>("#receipt-printer");
  if (!select) return;
  const printers = await window.posAPI.listPrinters().catch(() => []);
  select.replaceChildren(new Option("System Default (show print dialog)", ""));
  for (const p of printers) select.add(new Option(p.displayName, p.name));
  if (savedValue && !Array.from(select.options).some((o) => o.value === savedValue)) {
    select.add(new Option(`${savedValue} (not currently detected)`, savedValue));
  }
  select.value = savedValue;
}

function populateSettingsForm(settings: RendererSettings): void {
  (document.querySelector<HTMLInputElement>("#erpnext-url") as HTMLInputElement).value = settings.erpnextUrl;
  const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key");
  const apiSecretInput = document.querySelector<HTMLInputElement>("#api-secret");
  if (apiKeyInput) apiKeyInput.value = settings.apiKey;
  if (apiSecretInput) { apiSecretInput.value = ""; apiSecretInput.placeholder = settings.hasApiSecret ? "Saved securely; enter to replace" : "Enter to save"; }
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
  void populatePrinterDropdown(settings.receiptPrinter);
  const themeSelect = document.querySelector<HTMLSelectElement>("#color-theme");
  if (themeSelect) themeSelect.value = settings.colorTheme || "warm-market";
  applyColorTheme(settings.colorTheme);
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

function setCashierPinMode(mode: CashierPinMode, message = ""): void {
  cashierPinMode = mode;
  const online = isOnline();
  const passwordRow = document.querySelector<HTMLElement>("#cashier-password-row");
  const offlinePinRow = document.querySelector<HTMLElement>("#cashier-offline-pin-row");
  const offlinePinConfirmRow = document.querySelector<HTMLElement>("#cashier-offline-pin-confirm-row");
  const offlineNote = document.querySelector<HTMLElement>("#cashier-offline-note");
  const submitButton = document.querySelector<HTMLButtonElement>("#cashier-login-submit");
  const changeButton = document.querySelector<HTMLButtonElement>("#cashier-pin-change");
  const resetButton = document.querySelector<HTMLButtonElement>("#cashier-pin-reset");
  const msg = document.querySelector<HTMLElement>("#cashier-login-message");
  const pinKeypad = document.querySelector<HTMLElement>("#cashier-pin-keypad");
  const needsPin = !online || mode !== "login";
  if (passwordRow) passwordRow.hidden = !online;
  if (offlinePinRow) offlinePinRow.hidden = !needsPin;
  if (offlinePinConfirmRow) offlinePinConfirmRow.hidden = !online || mode === "login";
  // Keypad tracks the same visibility as the offline PIN row — it's an alternate
  // input surface for that same field, not a separate piece of state.
  if (pinKeypad) pinKeypad.hidden = !needsPin;
  if (changeButton) changeButton.hidden = !online;
  if (resetButton) resetButton.hidden = !online;
  if (submitButton) submitButton.textContent = mode === "login" ? "Login" : mode === "setup" ? "Save Offline PIN" : "Change Offline PIN";
  if (offlineNote) {
    offlineNote.textContent = !online
      ? "Use the offline PIN saved after a previous online cashier login."
      : mode === "login"
        ? "Offline PIN is only needed for offline login or when creating/changing the local PIN."
        : "ERPNext password verifies the cashier online. The Offline Cashier PIN is stored locally as a salted hash.";
  }
  if (msg && message) msg.textContent = message;
  activePinFieldId = "cashier-offline-pin";
  updatePinKeypadDisplay();
}

// --- Numeric PIN keypad -------------------------------------------------
// Writes into whichever of #cashier-offline-pin / #cashier-offline-pin-confirm
// last had focus, so the existing submitCashierLogin()/setCashierPinMode()
// logic (which reads those inputs' .value directly) needs no changes at all.
let activePinFieldId: "cashier-offline-pin" | "cashier-offline-pin-confirm" = "cashier-offline-pin";

function getActivePinInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`#${activePinFieldId}`);
}

function updatePinKeypadDisplay(): void {
  const input = getActivePinInput();
  const dotsEl = document.querySelector<HTMLElement>("#pin-keypad-dots");
  const countEl = document.querySelector<HTMLElement>("#pin-keypad-count");
  const label = document.querySelector<HTMLElement>("#pin-keypad-target-label");
  const len = input?.value.length ?? 0;
  if (dotsEl) {
    dotsEl.replaceChildren(...Array.from({ length: len }, () => {
      const dot = document.createElement("span");
      dot.className = "pin-keypad-dot";
      return dot;
    }));
  }
  if (countEl) countEl.textContent = len ? `${len} digit${len === 1 ? "" : "s"}` : "";
  if (label) label.textContent = activePinFieldId === "cashier-offline-pin-confirm" ? "Entering: Confirm PIN" : "Entering: Offline PIN";
}

function pinKeypadPressDigit(digit: string): void {
  const input = getActivePinInput();
  if (!input || input.value.length >= 12) return;
  input.value += digit;
  updatePinKeypadDisplay();
}

function pinKeypadBackspace(): void {
  const input = getActivePinInput();
  if (!input) return;
  input.value = input.value.slice(0, -1);
  updatePinKeypadDisplay();
}

function pinKeypadClear(): void {
  const input = getActivePinInput();
  if (!input) return;
  input.value = "";
  updatePinKeypadDisplay();
}

function initPinKeypad(): void {
  document.querySelectorAll<HTMLButtonElement>(".pin-keypad-key[data-digit]").forEach((button) => {
    button.addEventListener("click", () => pinKeypadPressDigit(button.dataset.digit ?? ""));
  });
  document.querySelector<HTMLButtonElement>("#pin-keypad-backspace")?.addEventListener("click", pinKeypadBackspace);
  document.querySelector<HTMLButtonElement>("#pin-keypad-clear")?.addEventListener("click", pinKeypadClear);
  document.querySelector<HTMLInputElement>("#cashier-offline-pin")?.addEventListener("focus", () => { activePinFieldId = "cashier-offline-pin"; updatePinKeypadDisplay(); });
  document.querySelector<HTMLInputElement>("#cashier-offline-pin-confirm")?.addEventListener("focus", () => { activePinFieldId = "cashier-offline-pin-confirm"; updatePinKeypadDisplay(); });
  document.querySelector<HTMLInputElement>("#cashier-offline-pin")?.addEventListener("input", updatePinKeypadDisplay);
  document.querySelector<HTMLInputElement>("#cashier-offline-pin-confirm")?.addEventListener("input", updatePinKeypadDisplay);
}

// --- Offline-PIN lockout countdown --------------------------------------
// Purely a display-layer read of the lockout error text main.ts already
// returns (validatePinFormat/ADMIN_PIN_MAX_ATTEMPTS/ADMIN_PIN_LOCK_MS are
// untouched) — no lockout logic changes, just a friendlier countdown instead
// of a static sentence.
let cashierLockoutTimer: number | undefined;

function parseLockoutSeconds(message: string): number | null {
  const secondsMatch = /try again in\s+(\d+)s/i.exec(message);
  if (secondsMatch) return Number(secondsMatch[1]);
  const minutesMatch = /locked for\s+(\d+)\s*minutes?/i.exec(message);
  if (minutesMatch) return Number(minutesMatch[1]) * 60;
  return null;
}

function showLockoutCountdown(message: string): void {
  const lockoutEl = document.querySelector<HTMLElement>("#cashier-login-lockout");
  if (!lockoutEl) return;
  if (cashierLockoutTimer !== undefined) { window.clearInterval(cashierLockoutTimer); cashierLockoutTimer = undefined; }
  let remaining = parseLockoutSeconds(message);
  if (remaining === null) { lockoutEl.hidden = true; return; }
  lockoutEl.hidden = false;
  const tick = () => {
    if (remaining === null || remaining <= 0) {
      lockoutEl.textContent = "You can try again now.";
      if (cashierLockoutTimer !== undefined) { window.clearInterval(cashierLockoutTimer); cashierLockoutTimer = undefined; }
      return;
    }
    lockoutEl.textContent = `Locked — try again in ${remaining}s`;
    remaining -= 1;
  };
  tick();
  cashierLockoutTimer = window.setInterval(tick, 1000);
}

async function showCashierLogin(message = ""): Promise<void> {
  const settings = await window.posAPI.loadSettings().catch(() => null);
  const online = isOnline();
  const remembered = await window.posAPI.getRememberedCashiers().catch(() => []);
  const usernameInput = document.querySelector<HTMLInputElement>("#cashier-username");
  const passwordInput = document.querySelector<HTMLInputElement>("#cashier-password");
  const useOAuth = online && isCapacitorRuntime();
  const usernameRow = usernameInput?.closest<HTMLElement>("label");
  const passwordRow = passwordInput?.closest<HTMLElement>("label");
  if (usernameRow) usernameRow.hidden = useOAuth;
  if (passwordRow) passwordRow.hidden = useOAuth;
  const loginButton = document.querySelector<HTMLButtonElement>("#cashier-login-submit");
  if (loginButton) loginButton.textContent = useOAuth ? "Sign in with ERPNext" : "Login";
  const options = document.querySelector<HTMLDataListElement>("#cashier-email-options");
  if (options) options.replaceChildren(...remembered.map((email) => {
    const option = document.createElement("option");
    option.value = email;
    return option;
  }));
  const usernamePrefilled = Boolean(usernameInput && !usernameInput.value && remembered[0]);
  if (usernameInput && !usernameInput.value && remembered[0]) usernameInput.value = remembered[0];
  setText("#cashier-login-terminal", settings?.terminalId ?? "");
  setText("#cashier-login-profile", settings?.posProfile ?? "");
  setText("#cashier-login-connection", online ? "Online" : "Offline");
  const msg = document.querySelector<HTMLElement>("#cashier-login-message");
  if (msg) msg.textContent = message || (online ? "Enter ERPNext cashier credentials." : "Enter cashier username and offline PIN.");
  showLockoutCountdown("");
  setCashierPinMode(online ? "login" : "login");
  showScreen("cashier-login");
  // Offline restart with a remembered cashier: username is already correct, so
  // skip straight to the PIN field instead of forcing a redundant click/tab
  // through a field that rarely needs retyping (still requires the PIN itself).
  const offlinePinInput = document.querySelector<HTMLInputElement>("#cashier-offline-pin");
  const fastPathTarget = !online && usernamePrefilled ? offlinePinInput : usernameInput;
  window.setTimeout(() => fastPathTarget?.focus(), 0);
}

async function continueAfterCashierLogin(): Promise<void> {
  const progress = document.querySelector<HTMLElement>("#startup-progress");
  if (!isOnline()) {
    const cachedCfg = await window.posAPI.getCachedPosConfiguration();
    if (!cachedCfg) {
      setOverallBadge("Cached Data Missing", "err");
      if (progress) progress.textContent = "Cached POS configuration missing";
      const msg = document.querySelector<HTMLElement>("#cashier-login-message");
      if (msg) msg.textContent = "Offline selling requires cached POS configuration, payment methods, item data and customer data.";
      return;
    }
    showPosConfigurationSummary(cachedCfg);
    await loadCachedPosSession();
    await seedSessionFromCache();
    await seedDefaultCustomerFromConfig(cachedCfg);
    updatePosHeader(); setupCompleted = true;
    await markDataAvailabilityFromCache(); startBackgroundSync(); void renderSyncStatus(); void updateOfflineUi();
    setOverallBadge("Ready Using Cached Data", "warn");
    if (progress) progress.textContent = "Offline - using cached data";
    showScreen("pos");
    return;
  }
  if (isCapacitorRuntime()) { await runPosBootstrap("oauth-cashier-login"); return; }
  const ok = await validateSession("cashier-login");
  updatePosHeader(); setupCompleted = true;
  void markDataAvailabilityFromCache(); startBackgroundSync(); void renderSyncStatus(); void updateOfflineUi();
  if (ok) { setStep("session", isPreviousDateSession() ? "warning" : "complete"); setOverallBadge(isPreviousDateSession() ? "Close Previous Shift" : "POS Ready", isPreviousDateSession() ? "warn" : "ok"); if (progress) progress.textContent = isPreviousDateSession() ? "Previous date shift is still open" : "Ready"; showScreen("pos"); }
  else if (!sessionHasEntry) { setStep("session", "warning"); setOverallBadge("Start Shift Required", "info"); if (progress) progress.textContent = "No active POS Opening Entry"; void showStartShift(); }
  else { setStep("session", "failed"); setOverallBadge("Action Required", "err"); if (progress) progress.textContent = sessionState.reason; showScreen("pos"); showSessionInvalid(sessionState.reason); }
}

async function submitCashierLogin(): Promise<void> {
  const usernameInput = document.querySelector<HTMLInputElement>("#cashier-username");
  const passwordInput = document.querySelector<HTMLInputElement>("#cashier-password");
  const offlinePinInput = document.querySelector<HTMLInputElement>("#cashier-offline-pin");
  const offlinePinConfirmInput = document.querySelector<HTMLInputElement>("#cashier-offline-pin-confirm");
  const button = document.querySelector<HTMLButtonElement>("#cashier-login-submit");
  const msg = document.querySelector<HTMLElement>("#cashier-login-message");
  const username = usernameInput?.value.trim() ?? "";
  const password = passwordInput?.value ?? "";
  const offlinePin = offlinePinInput?.value ?? "";
  const offlinePinConfirm = offlinePinConfirmInput?.value ?? "";
  const online = isOnline();
  const useOAuth = online && isCapacitorRuntime();
  const sendPin = online && cashierPinMode !== "login";
  if (!useOAuth && !username) { if (msg) msg.textContent = "Enter cashier username."; return; }
  if (online && !useOAuth && !password) { if (msg) msg.textContent = "Enter cashier username and password."; return; }
  if (sendPin && !offlinePin) { if (msg) msg.textContent = "Enter and confirm the Offline Cashier PIN."; return; }
  if (sendPin && offlinePin !== offlinePinConfirm) { if (msg) msg.textContent = "Offline Cashier PIN confirmation does not match."; return; }
  if (!online && !offlinePin) { if (msg) msg.textContent = "Enter cashier username and offline PIN."; return; }
  if (button) button.disabled = true;
  if (msg) msg.textContent = useOAuth ? "Opening secure ERPNext sign in…" : online ? "Verifying cashier..." : "Checking offline cashier PIN...";
  try {
    const result = online
      ? await window.posAPI.cashierLogin({ username, password, offlinePin: sendPin ? offlinePin : "", offlinePinConfirm: sendPin ? offlinePinConfirm : "" })
      : await window.posAPI.cashierOfflineLogin({ username, pin: offlinePin });
    if (passwordInput) passwordInput.value = "";
    if (offlinePinInput) offlinePinInput.value = "";
    if (offlinePinConfirmInput) offlinePinConfirmInput.value = "";
    updatePinKeypadDisplay();
    if (result.requirePinSetup && !result.success) {
      // Username/password already verified server-side to get here - restore the
      // password the cashier just typed (cleared above) so they only need to add
      // PIN+confirm and resubmit, instead of retyping the whole form from scratch.
      if (passwordInput) passwordInput.value = password;
      setCashierPinMode("setup", result.error ?? "Create Offline Cashier PIN once for this cashier.");
      document.querySelector<HTMLInputElement>("#cashier-offline-pin")?.focus();
      return;
    }
    if (!result.success) { if (msg) msg.textContent = result.error ?? "Cashier login failed."; showLockoutCountdown(result.error ?? ""); return; }
    const selectedProfile = document.querySelector<HTMLSelectElement>("#pos-profile")?.value ?? "";
    if (result.allowedPosProfiles.length && selectedProfile && !result.allowedPosProfiles.includes(selectedProfile)) {
      if (msg) msg.textContent = `Cashier is not allowed for POS Profile ${selectedProfile}.`;
      return;
    }
    cashierSession = { ...result, loginTime: new Date().toISOString() };
    cashierPinMode = "login";
    if (msg) msg.textContent = result.offlineLogin
      ? "Offline cashier login active — sales will be queued until ERPNext is online."
      : `Logged in as ${cashierDisplay()}${result.offlineCached ? " and saved offline PIN." : ""}.`;
    updatePosHeader();
    await continueAfterCashierLogin();
  } finally {
    if (passwordInput) passwordInput.value = "";
    if (offlinePinInput) offlinePinInput.value = "";
    if (offlinePinConfirmInput) offlinePinConfirmInput.value = "";
    if (button) button.disabled = false;
  }
}

function logoutCashier(): void {
  cashierSession = null;
  updatePosHeader();
  void showCashierLogin("Cashier logged out. Local cache and queued sales are preserved.");
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

function adminMessage(id: string, text: string): void {
  const el = document.querySelector<HTMLElement>(id);
  if (el) el.textContent = text;
}

// Resetting a specific cashier's forgotten Offline PIN: a supervisor verifies
// their own ERPNext credentials (never the cashier's) to authorize it. This
// is the one remaining PIN concept that needs supervisor sign-off - Settings
// access (requestSettingsAuthorization, below) and shift start/close
// (cashierSession.canStartShift/canCloseShift) no longer go through any PIN
// at all.
async function requestSupervisorPinSetup(action: "reset_pin", cashierUser: string): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>("#admin-supervisor-dialog");
  const title = document.querySelector<HTMLElement>("#admin-supervisor-title");
  const note = document.querySelector<HTMLElement>("#admin-supervisor-note");
  const form = document.querySelector<HTMLFormElement>("#admin-supervisor-form");
  if (!dialog || !form) return false;
  const label = "Offline Cashier PIN";
  if (!navigator.onLine) {
    appAlert(`${label} reset requires an online connection and authorized ERPNext supervisor credentials.`);
    return false;
  }
  if (title) title.textContent = `Reset ${label} for ${cashierUser}`;
  if (note) note.textContent = `A supervisor verifies their own ERPNext credentials to reset ${cashierUser}'s Offline Cashier PIN - ${cashierUser}'s own password is not needed.`;
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
      const auth = await window.posAPI.authorizeAdminAction({ username, password, action, cashierUser });
      if (passwordInput) passwordInput.value = "";
      if (!auth.ok) { adminMessage("#admin-supervisor-message", auth.error ?? "Supervisor authorization failed."); return; }
      const saved = await window.posAPI.resetCashierOfflinePin({ cashierUser, token: auth.token, pin, confirmPin });
      if (pinInput) pinInput.value = "";
      if (confirmInput) confirmInput.value = "";
      if (!saved.ok) { adminMessage("#admin-supervisor-message", saved.error ?? `Unable to save ${label}.`); return; }
      dialog.close();
      form.onsubmit = null;
      resolve(true);
    };
    dialog.showModal();
    window.setTimeout(()=>document.querySelector<HTMLInputElement>("#admin-supervisor-user")?.focus(),0);
  });
}

// Settings always requires a fresh username+password check (server-side role
// check via the "change_credentials" admin action) rather than a stored PIN -
// deliberately NOT based on inspecting cashierSession.roles client-side,
// since the same role (e.g. System Manager) can also be what grants a
// regular cashier canCloseShift; being logged in as that cashier must never
// silently unlock Settings too. This is always a separate, explicit step.
async function requestSettingsAuthorization(): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>("#settings-auth-dialog");
  const form = document.querySelector<HTMLFormElement>("#settings-auth-form");
  if (!dialog || !form) return false;
  if (!navigator.onLine) { appAlert("Settings requires an online connection to verify your ERPNext account."); return false; }
  ["#settings-auth-user","#settings-auth-password"].forEach((id)=>{const input=document.querySelector<HTMLInputElement>(id);if(input)input.value="";});
  adminMessage("#settings-auth-message", "");
  return new Promise((resolve) => {
    const cleanup = () => { form.onsubmit = null; resolve(false); };
    document.querySelector<HTMLButtonElement>("#settings-auth-cancel")!.onclick = () => { dialog.close(); cleanup(); };
    form.onsubmit = async (event) => {
      event.preventDefault();
      const username = document.querySelector<HTMLInputElement>("#settings-auth-user")?.value.trim() ?? "";
      const passwordInput = document.querySelector<HTMLInputElement>("#settings-auth-password");
      const password = passwordInput?.value ?? "";
      adminMessage("#settings-auth-message", "Verifying...");
      const auth = await window.posAPI.authorizeAdminAction({ username, password, action: "change_credentials" });
      if (passwordInput) passwordInput.value = "";
      if (!auth.ok) { adminMessage("#settings-auth-message", auth.error ?? "Settings authorization failed."); return; }
      dialog.close();
      form.onsubmit = null;
      resolve(true);
    };
    dialog.showModal();
    window.setTimeout(()=>document.querySelector<HTMLInputElement>("#settings-auth-user")?.focus(),0);
  });
}

// For the three entry points reached while a cashier session already exists
// (start-shift screen, POS header gear icon, session-invalid overlay) -
// still always prompts fresh credentials, same as requestSettingsAuthorization,
// rather than trusting the existing session's role for the reason above.
async function openSettingsIfAuthorized(): Promise<void> {
  if (await requestSettingsAuthorization()) showScreen("settings");
}

function initializeRenderer(): void {
  void showDatabaseStatus();
  void loadPosProfileCacheStatus();
  void loadSettingsIntoForm();
  void loadCachedPosConfiguration();
  void loadCachedPosSession();
  void window.posAPI.getCatalogTotals().then(showCatalogTotals);
  window.posAPI.onCatalogProgress(showCatalogProgress);
  void window.posAPI.loadCart().then((state) => { cartLines = state.lines; selectedCartIndex = cartLines.length ? 0 : -1; renderCart(); focusCart(); }); void window.posAPI.loadBenefitsDraft().then((draft) => { if(draft) appliedBenefits = normalizeBenefits(draft); }); void window.posAPI.getTerminalInvoiceId().then((id)=>{terminalInvoiceId=id;}); window.posAPI.onCompleteSaleShortcut(()=>void submitCurrentSale());
  window.posAPI.onFocusScanner(() => focusCart(true));
  void renderSyncStatus();
  void runPosBootstrap("startup");
  window.addEventListener("online", () => { scheduleCartPreview(); void backgroundSyncTick(); void syncQueueNow(); });
  document.querySelector<HTMLButtonElement>("#retry-startup")?.addEventListener("click", () => void runPosBootstrap("retry"));
  document.querySelector<HTMLFormElement>("#cashier-login-form")?.addEventListener("submit", (event) => { event.preventDefault(); void submitCashierLogin(); });
  initPinKeypad();
  document.querySelector<HTMLButtonElement>("#cashier-pin-change")?.addEventListener("click", () => setCashierPinMode("change", "Enter ERPNext password, then enter and confirm the new Offline Cashier PIN."));
  document.querySelector<HTMLButtonElement>("#cashier-pin-reset")?.addEventListener("click", () => {
    const cashierUser = document.querySelector<HTMLInputElement>("#cashier-username")?.value.trim() ?? "";
    const msg = document.querySelector<HTMLElement>("#cashier-login-message");
    if (!cashierUser) { if (msg) msg.textContent = "Enter the cashier's username above first, then Reset Offline PIN."; return; }
    // Supervisor-authorized: unlike "Change", this cashier doesn't need to know/enter
    // their own ERPNext password - a supervisor authorizes the reset instead.
    void requestSupervisorPinSetup("reset_pin", cashierUser).then((ok) => {
      if (ok) setCashierPinMode("login", `Offline PIN reset for ${cashierUser}. They can now log in offline with the new PIN.`);
    });
  });
  document.querySelector<HTMLButtonElement>("#cashier-login-settings")?.addEventListener("click", () => void openSettingsIfAuthorized());
  document.querySelector<HTMLButtonElement>("#cashier-login-retry")?.addEventListener("click", () => void runPosBootstrap("cashier-login-retry"));
  // Deliberately ungated (no admin PIN, no cashier login): the full Settings
  // screen behind #cashier-login-settings requires an admin PIN, but setting
  // one up (when none exists yet) itself requires reaching the ERPNext server
  // to verify a supervisor — a deadlock on a brand-new terminal with no
  // server URL saved yet, or one saved with a typo. This is the escape hatch.
  document.querySelector<HTMLButtonElement>("#cashier-login-quick-connect")?.addEventListener("click", async () => {
    const current = await window.posAPI.loadSettings();
    const urlInput = document.querySelector<HTMLInputElement>("#quick-connect-url");
    const keyInput = document.querySelector<HTMLInputElement>("#quick-connect-api-key");
    const secretInput = document.querySelector<HTMLInputElement>("#quick-connect-api-secret");
    if (urlInput) urlInput.value = current.erpnextUrl ?? "";
    if (keyInput) keyInput.value = current.apiKey ?? "";
    if (secretInput) secretInput.value = "";
    const msg = document.querySelector<HTMLElement>("#quick-connect-message");
    if (msg) msg.textContent = "";
    document.querySelector<HTMLDialogElement>("#quick-connect-dialog")?.showModal();
    window.setTimeout(() => urlInput?.focus(), 0);
  });
  document.querySelector<HTMLButtonElement>("#quick-connect-cancel")?.addEventListener("click", () => document.querySelector<HTMLDialogElement>("#quick-connect-dialog")?.close());
  document.querySelector<HTMLFormElement>("#quick-connect-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const msg = document.querySelector<HTMLElement>("#quick-connect-message");
    const button = document.querySelector<HTMLButtonElement>("#quick-connect-save");
    const url = document.querySelector<HTMLInputElement>("#quick-connect-url")?.value.trim() ?? "";
    const apiKey = document.querySelector<HTMLInputElement>("#quick-connect-api-key")?.value.trim() ?? "";
    const apiSecret = document.querySelector<HTMLInputElement>("#quick-connect-api-secret")?.value ?? "";
    if (!url || !apiKey) { if (msg) msg.textContent = "Server URL and API Key are required."; return; }
    if (button) button.disabled = true;
    if (msg) msg.textContent = "Saving...";
    try {
      // Merge onto the full current settings (not just these 3 fields) so a
      // quick URL fix here can't silently wipe out posProfile/branch/warehouse
      // that were already configured. terminalId is passed through unchanged —
      // it's server-derived (from the assigned POS Profile), not user-editable here.
      const current = await window.posAPI.loadSettings();
      await window.posAPI.saveSettings({
        erpnextUrl: url,
        apiKey,
        apiSecret,
        terminalId: current.terminalId ?? "",
        posProfile: current.posProfile ?? "",
        branch: current.branch ?? "",
        warehouse: current.warehouse ?? "",
        receiptPrinter: current.receiptPrinter ?? "",
        colorTheme: current.colorTheme ?? "warm-market"
      });
      document.querySelector<HTMLDialogElement>("#quick-connect-dialog")?.close();
      await runPosBootstrap("quick-connect");
    } catch (error) {
      if (msg) msg.textContent = error instanceof Error ? error.message : "Failed to save server connection.";
    } finally {
      if (button) button.disabled = false;
    }
  });
  document.querySelector<HTMLButtonElement>("#complete-setup")?.addEventListener("click", (e) => { /* form submit handles save + bootstrap */ void e; });
  document.querySelector<HTMLButtonElement>("#refresh-config")?.addEventListener("click", () => void syncConfigNow());
  document.querySelector<HTMLButtonElement>("#start-shift")?.addEventListener("click", () => {
    if (!cashierSession?.canStartShift) { appAlert("Your account is not permitted to start a shift."); return; }
    void startShift();
  });
  document.querySelector<HTMLButtonElement>("#start-shift-refresh")?.addEventListener("click", () => void refreshFromStartShift());
  document.querySelector<HTMLButtonElement>("#start-shift-cancel")?.addEventListener("click", () => void goToPos());
  document.querySelector<HTMLButtonElement>("#start-shift-settings")?.addEventListener("click", () => void openSettingsIfAuthorized());
  // Close Shift + Shift History actions.
  document.querySelector<HTMLButtonElement>("#pos-close-shift")?.addEventListener("click", () => {
    if (!cashierSession?.canCloseShift) { appAlert("Your account is not permitted to close this shift."); return; }
    void showCloseShift();
  });
  document.querySelector<HTMLButtonElement>("#cashier-logout")?.addEventListener("click", () => { if (txnInProgress()) { cartMessage("Finish the current payment/refund before switching cashier."); return; } logoutCashier(); });
  document.querySelector<HTMLButtonElement>("#pos-sync-queue")?.addEventListener("click", () => void syncQueueNow(true));
  void updateOfflineUi();
  document.querySelector<HTMLButtonElement>("#close-shift-back")?.addEventListener("click", () => showScreen("pos"));
  document.querySelector<HTMLButtonElement>("#close-shift-cancel")?.addEventListener("click", () => showScreen("pos"));
  document.querySelector<HTMLButtonElement>("#close-shift-submit")?.addEventListener("click", () => {
    if (!cashierSession?.canCloseShift) { appAlert("Your account is not permitted to close this shift."); return; }
    void submitCloseShift();
  });
  document.querySelector<HTMLButtonElement>("#close-shift-print")?.addEventListener("click", () => void printShiftSummary());
  document.querySelector<HTMLButtonElement>("#close-shift-hold")?.addEventListener("click", () => void holdCurrentSale());
  document.querySelector<HTMLButtonElement>("#open-shift-history")?.addEventListener("click", () => void openShiftHistory());
  document.querySelector<HTMLButtonElement>("#shift-history-back")?.addEventListener("click", () => { if (shiftClosed) void showStartShift(); else void goToPos(); });
  document.querySelector<HTMLButtonElement>("#open-settings")?.addEventListener("click", () => void openSettingsIfAuthorized());
  document.querySelector<HTMLButtonElement>("#back-to-pos")?.addEventListener("click", () => void goToPos());
  // Session-invalid overlay actions (non-destructive — cart/customer/payment preserved).
  document.querySelector<HTMLButtonElement>("#session-refresh")?.addEventListener("click", () => void revalidateLive("refresh"));
  document.querySelector<HTMLButtonElement>("#session-switch")?.addEventListener("click", () => void switchToActiveShift());
  document.querySelector<HTMLButtonElement>("#session-go-shift")?.addEventListener("click", () => { clearSessionInvalid(); void showStartShift(); });
  document.querySelector<HTMLButtonElement>("#session-open-settings")?.addEventListener("click", () => void (async () => {
    if (!(await requestSettingsAuthorization())) return;
    clearSessionInvalid();
    showScreen("settings");
  })());
  // Revalidate the POS session whenever the window regains focus.
  window.addEventListener("focus", () => { if (isOnline()) void revalidateLive("focus"); });
  // Server-health poll (online/offline + reconnect-driven session revalidation).
  window.setInterval(async () => { try { const online = await window.posAPI.testServer(); const status = document.querySelector<HTMLElement>("#pos-server-status"); const connected = Boolean(online.connected); if (status) status.textContent = connected ? "Online" : "Offline"; setOnlineIndicator(connected);
      if (connected && !prevServerConnected) { scheduleCartPreview(); void revalidateLive("reconnect"); void backgroundSyncTick(); void syncQueueNow(); } // after reconnect: re-check session + drain offline queue + sync stale data
      prevServerConnected = connected; void updateOfflineUi();
    } catch { const status = document.querySelector<HTMLElement>("#pos-server-status"); if (status) status.textContent = "Reconnecting"; prevServerConnected = false; void updateOfflineUi(); } }, 30_000);
  // Revalidate the POS session every 60 seconds while online.
  window.setInterval(() => { if (isOnline()) void revalidateLive("interval"); }, 60_000);

  // Fetch API Key/Secret via ERPNext username+password instead of copying them out of Frappe's
  // User settings. Only fills the fields — the existing Save and Complete Setup flow still applies.
  document.querySelector<HTMLButtonElement>("#provision-credentials")?.addEventListener("click", async () => {
    const button = document.querySelector<HTMLButtonElement>("#provision-credentials");
    const messageEl = document.querySelector<HTMLElement>("#provision-message");
    const erpnextUrl = document.querySelector<HTMLInputElement>("#erpnext-url")?.value.trim() ?? "";
    const username = document.querySelector<HTMLInputElement>("#provision-username")?.value.trim() ?? "";
    const password = document.querySelector<HTMLInputElement>("#provision-password")?.value ?? "";
    if (messageEl) { messageEl.textContent = ""; messageEl.classList.remove("error"); }
    if (!erpnextUrl || !username || !password) {
      if (messageEl) { messageEl.textContent = "ERPNext URL, username, and password are required."; messageEl.classList.add("error"); }
      return;
    }
    if (button) { button.disabled = true; button.textContent = "Fetching..."; }
    try {
      const result = await window.posAPI.provisionCredentials({ erpnextUrl, username, password });
      if (!result.success) {
        if (messageEl) { messageEl.textContent = result.error || "Unable to fetch credentials."; messageEl.classList.add("error"); }
        return;
      }
      const keyInput = document.querySelector<HTMLInputElement>("#api-key");
      const secretInput = document.querySelector<HTMLInputElement>("#api-secret");
      if (keyInput) keyInput.value = result.apiKey;
      if (secretInput) secretInput.value = result.apiSecret;
      const passwordInput = document.querySelector<HTMLInputElement>("#provision-password");
      if (passwordInput) passwordInput.value = "";
      if (messageEl) messageEl.textContent = "Credentials fetched — review and Save and Complete Setup below.";
    } catch {
      if (messageEl) { messageEl.textContent = "Unable to fetch credentials."; messageEl.classList.add("error"); }
    } finally {
      if (button) { button.disabled = false; button.textContent = "Fetch Credentials"; }
    }
  });

  // Primary action: Save and Complete Setup -> save settings, then run the one bootstrap chain.
  document.querySelector<HTMLFormElement>("#settings-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector<HTMLButtonElement>("#complete-setup");
    if (button) button.disabled = true;
    try {
      const previous = await window.posAPI.loadSettings().catch(() => null);
      const next = getSettingsFromForm();
      // Only force a cashier re-login when something identity/auth-relevant actually
      // changed (URL/key/terminal/profile, or the secret field was non-blank meaning
      // it's being replaced — blank means "keep existing" per saveSettings). A save
      // that only touches e.g. branch/warehouse shouldn't log the cashier out.
      const identityChanged = !previous
        || previous.erpnextUrl !== next.erpnextUrl
        || previous.apiKey !== next.apiKey
        || previous.terminalId !== next.terminalId
        || previous.posProfile !== next.posProfile
        || Boolean(next.apiSecret);
      await window.posAPI.saveSettings(next);
      applyColorTheme(next.colorTheme ?? "warm-market");
      if (identityChanged) cashierSession = null;
      updatePosHeader();
      showSettingsMessage(identityChanged ? "Settings saved — completing setup…" : "Settings saved.");
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
      const result = await window.posAPI.syncPosSession(cashierRequest());
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
    if (button) { button.disabled = true; button.textContent = "Syncing…"; }
    try { showCatalogProgress("Catalog sync started…"); await syncItemsNow("full"); showCatalogProgress("Catalog sync complete."); showSettingsMessage("Item catalogue synced"); }
    catch { showCatalogProgress("Catalog sync failed."); }
    finally { if (button) { button.disabled = false; button.textContent = "Force Full Item Catalogue Sync"; } }
  });

  document.querySelector<HTMLButtonElement>("#sync-customers")?.addEventListener("click", async () => { await syncCustomersNow("full"); const state = await window.posAPI.getCustomerSyncState(); showSettingsMessage(`Customers synced: ${state.count}`); });
  document.querySelector<HTMLButtonElement>("#sync-fbr-config")?.addEventListener("click", async () => { const button=document.querySelector<HTMLButtonElement>("#sync-fbr-config"); if(button){button.disabled=true;button.textContent="Syncing...";} try { await syncFbrNow("full"); showSettingsMessage("FBR configuration synced"); } catch { showSettingsMessage("FBR sync failed"); } finally { if(button){button.disabled=false;button.textContent="Force Full FBR Configuration Sync";} } });
  document.querySelector<HTMLButtonElement>("#preview-customer-display")?.addEventListener("click", async () => {
    const statusEl = document.querySelector<HTMLElement>("#customer-display-status");
    const result = await window.posAPI.previewCustomerDisplay();
    if (!statusEl) return;
    statusEl.textContent = result === "no-second-display"
      ? "No second monitor detected — this shouldn't happen, the preview always falls back to a small window."
      : result === "opened-windowed"
        ? "Opened a preview window on this screen — scan/search items on the main POS screen to see it update live."
        : result === "opened-fullscreen"
          ? "Opened on the detected second monitor."
          : "Customer display window focused.";
  });
  setupUpdateUi();
  // No gate here: reaching this point already means Settings itself was
  // reached (fresh install, ungated, or an already-authorized admin), so a
  // further per-<details> gate on top would be redundant.
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
  document.querySelector("#cart-decrease")?.addEventListener("click", () => void changeCartQuantity(-1));
  document.querySelector("#cart-increase")?.addEventListener("click", () => void changeCartQuantity(1));
  document.querySelector("#cart-remove")?.addEventListener("click", () => void removeSelectedCartRow());
  document.querySelector("#mobile-select-customer")?.addEventListener("click", () => openCustomerSearch());
  document.querySelector("#cart-clear")?.addEventListener("click", async () => { if (!cartLines.length || !appConfirm("Clear the full cart?")) return; cartLines=[]; selectedCartIndex=-1; await afterCartMutation("Cart cleared"); });
  document.querySelector<HTMLFormElement>("#quantity-form")?.addEventListener("submit", (event) => { event.preventDefault(); const submitter = event.submitter as HTMLButtonElement | null; if (submitter?.value === "cancel") { document.querySelector<HTMLDialogElement>("#quantity-dialog")?.close(); focusCart(); } else void saveDialogQuantity(); });
  document.querySelector<HTMLDialogElement>("#quantity-dialog")?.addEventListener("cancel", () => focusCart());
  // Payment dialog controls
  document.querySelector<HTMLButtonElement>('#open-payment')?.addEventListener('click', () => void openPayment());
  document.querySelector<HTMLButtonElement>('#open-benefits')?.addEventListener('click', () => void openBenefitsModern());
  document.querySelector<HTMLButtonElement>('#payment-exact')?.addEventListener('click', () => void addExactAmount());
  document.querySelector<HTMLButtonElement>('#payment-add')?.addEventListener('click', () => void addPayment());
  document.querySelector<HTMLButtonElement>('#payment-complete')?.addEventListener('click', () => void completePaymentAllocation());
  document.querySelector<HTMLButtonElement>('#complete-sale')?.addEventListener('click', () => void submitCurrentSale());
  // Enter-to-add is handled by the capture-phase global keydown listener
  // (search for "pressing Enter on the Payment screen") — a listener bound
  // here would never fire, since capture always runs first.
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
  document.querySelector<HTMLButtonElement>('#benefits-apply')?.addEventListener('click', () => void applyBenefitsModern());
  document.querySelector<HTMLButtonElement>('#benefits-remove')?.addEventListener('click', () => void removeBenefitsModern());
  document.querySelector<HTMLInputElement>('#benefits-redeem-points')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void applyBenefitsModern(); } });
  document.querySelector<HTMLInputElement>('#benefits-coupon-code')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void applyBenefitsModern(); } });
  document.querySelector<HTMLInputElement>('#benefits-gift-voucher-code')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void applyBenefitsModern(); } });
  document.addEventListener("keydown", (event) => {
    // Refund quantity inputs own their keystrokes — never let global POS shortcuts intercept typing/arrows there.
    if ((document.activeElement as HTMLElement | null)?.closest("#refund-items")) return;
    // None of the shortcuts below intentionally use Alt/Meta - swallowing
    // those combos here was breaking Alt+F4 (main.ts's own before-input-event
    // handles that explicitly now, but this must get out of its way first,
    // since this listener runs in the capture phase and would otherwise
    // preventDefault/stopPropagation the bare "F4" first and misfire
    // "change quantity" instead).
    if (event.altKey || event.metaKey) return;
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
    if (event.key === 'F7') { event.preventDefault(); event.stopPropagation(); if (benefitsOpen) { closeBenefitsDialog(); } else { void openBenefitsModern(); } return; }
    if (event.key === 'F9') { event.preventDefault(); event.stopPropagation(); void submitCurrentSale(); return; }
    if (benefitsOpen) {
      if (event.key === 'Tab') { /* default behavior for Tab */ return; }
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void applyBenefitsModern(); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeBenefitsDialog(); return; }
    }
    if (event.key === 'F6') { event.preventDefault(); event.stopPropagation(); if (paymentOpen) { void completePaymentAllocation(); } else { void openPayment(); } return; }
    if (paymentOpen) {
      // Payment dialog keyboard controls. Method buttons render in a 3-column CSS
      // grid (PAYMENT_METHOD_GRID_COLUMNS) - Up/Down move a full row (±3) and
      // Left/Right move within a row (±1) to match what's visually happening,
      // instead of Up/Down stepping through the flat array one at a time.
      if (event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); selectedPaymentMethodIndex = Math.max(0, selectedPaymentMethodIndex - PAYMENT_METHOD_GRID_COLUMNS); renderPaymentMethods(); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); selectedPaymentMethodIndex = Math.min(paymentMethods.length - 1, selectedPaymentMethodIndex + PAYMENT_METHOD_GRID_COLUMNS); renderPaymentMethods(); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); selectedPaymentMethodIndex = Math.max(0, selectedPaymentMethodIndex - 1); renderPaymentMethods(); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); selectedPaymentMethodIndex = Math.min(paymentMethods.length - 1, selectedPaymentMethodIndex + 1); renderPaymentMethods(); return; }
      // Number-key quick-select: jump straight to method N (1-9) matching its
      // position in the grid, shown as a small badge on each button.
      if (/^[1-9]$/.test(event.key) && document.activeElement !== document.querySelector('#payment-amount')) {
        const idx = Number(event.key) - 1;
        if (idx < paymentMethods.length) { event.preventDefault(); event.stopPropagation(); selectedPaymentMethodIndex = idx; renderPaymentMethods(); document.querySelector<HTMLInputElement>('#payment-amount')?.focus(); return; }
      }
      if (event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation();
        // This handler runs in the capture phase, so it always wins over any
        // listener bound directly to #payment-amount — Enter must be handled
        // here, not delegated, or it silently does nothing (the bug where
        // pressing Enter on the Payment screen didn't add the amount).
        if (document.activeElement === document.querySelector('#payment-amount')) { void addPayment(); return; }
        // Otherwise (e.g. a payment-method tile is keyboard-highlighted via the
        // arrow keys above): move focus to the amount field first, so the very
        // next Enter actually submits it.
        document.querySelector<HTMLInputElement>('#payment-amount')?.focus();
        return;
      }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePaymentDialog(); return; }
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
}

if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", initializeRenderer, { once: true });
else initializeRenderer();
