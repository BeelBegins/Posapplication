import type {
  DatabaseStatus, AppSettings, RendererSettings, PosProfileCacheStatus, CatalogTotals,
  CatalogSearchResult, CartState, HeldSaleInput, HeldSaleSummary, HeldSaleDetail,
  SalesHistoryFilter, SalesHistoryRow, QueuedSale, ShiftHistoryRow, ShiftHistoryInput
} from "./database";

/**
 * Contract for the local persistence layer, extracted from the current
 * better-sqlite3/Electron-coupled implementation in `database.ts`. Exists so a future
 * backend (e.g. @capacitor-community/sqlite for an Android port) has an explicit,
 * compiler-checked target to implement instead of a rewrite guided by reading call sites.
 * `database.ts` itself is unchanged; see the compile-time check at the bottom of this file.
 */
export interface IDatabaseService {
  // ----- Lifecycle -----
  initDatabase(): void;
  getDatabaseStatus(): DatabaseStatus;
  normalizeErpnextUrl(value: string): string;
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;

  // ----- Settings -----
  saveSettings(settings: AppSettings): { saved: true };
  getSettingsForRenderer(): RendererSettings;
  loadSettings(): AppSettings;

  // ----- FBR item config cache -----
  upsertFbrItemConfig(rows: Record<string, unknown>[], serviceFee: number): void;
  getFbrSyncState(): { itemCount: number; serviceFee: number; lastSynced: string | null; ready: boolean };
  getFbrItemConfigs(itemCodes: string[]): Record<string, Record<string, unknown>>;

  // ----- Held sales -----
  holdSale(input: HeldSaleInput): { id: number; displayName: string };
  listHeldSales(): HeldSaleSummary[];
  getHeldSale(id: number): HeldSaleDetail | null;
  deleteHeldSale(id: number): void;
  deleteAllHeldSales(): number;
  renameHeldSale(id: number, name: string): void;

  // ----- Sales history / offline queue -----
  listSalesHistory(filter: SalesHistoryFilter): SalesHistoryRow[];
  setSaleHistoryStatus(terminalInvoiceId: string, status: string): void;
  getSaleHistory(terminalInvoiceId: string): SalesHistoryRow | null;
  recordReprint(terminalInvoiceId: string): { reprintCount: number; lastReprintedAt: string };
  saveSaleHistory(id: string, status: string, payload: Record<string, unknown>, response?: Record<string, unknown> | null): void;
  cacheReceiptHtml(posInvoice: string, html: string): void;
  getCachedReceiptHtml(posInvoice: string): string | null;
  getQueuedSales(): QueuedSale[];
  getQueueCounts(): { queued: number; failed: number };
  getOpenTerminalInvoice(terminalId: string, createId: () => string): string;

  // ----- Refund log -----
  logRefund(returnInvoice: string, openingEntry: string, amount: number, modeOfPayment?: string): void;
  getShiftRefundTotal(openingEntry: string): number;
  getShiftRefundBreakdown(openingEntry: string): Record<string, number>;

  // ----- Shift history -----
  saveShiftHistory(input: ShiftHistoryInput): void;
  listShiftHistory(limit?: number): ShiftHistoryRow[];
  getShiftHistory(openingEntry: string): ShiftHistoryRow | null;

  // ----- Cart / payment / benefits drafts -----
  loadCartState(terminalId: string, openingEntry: string): CartState;
  saveCartState(terminalId: string, openingEntry: string, lines: unknown[]): void;
  loadPaymentDraft(cartKey: string): unknown[];
  savePaymentDraft(cartKey: string, payments: unknown[]): void;
  loadBenefitsDraft(cartKey: string): Record<string, unknown> | null;
  saveBenefitsDraft(cartKey: string, benefits: Record<string, unknown>): void;

  // ----- Customers -----
  upsertCustomers(customers: Record<string, unknown>[]): void;
  getCustomerSyncState(): { count: number; lastSynced: string | null };
  searchCustomers(query: string): Record<string, unknown>[];
  findCustomerByNormalizedMobile(normalizedMobile: string): Record<string, unknown> | null;
  cacheCustomer(name: string, data: Record<string, unknown>): void;
  getCachedCustomer(name: string): Record<string, unknown> | null;

  // ----- Catalog -----
  upsertCatalog(data: {
    items: Record<string, unknown>[]; prices: Record<string, unknown>[]; stock: Record<string, unknown>[];
    barcodes: Record<string, unknown>[]; conversions: Record<string, unknown>[]; totals: CatalogTotals;
    replaceBarcodes: boolean; replaceConversions: boolean;
  }): void;
  getCatalogTotals(): CatalogTotals;
  searchCatalog(query: string, warehouse: string): CatalogSearchResult[];
  lookupCatalog(query: string, warehouse: string): { exact: CatalogSearchResult | null; results: CatalogSearchResult[] };

  // ----- POS session / bootstrap / profile cache -----
  cachePosSession(openingEntry: string, posProfile: string, user: string, session: Record<string, unknown>, syncedAt: string): void;
  getCachedPosSession(posProfile: string): Record<string, unknown> | null;
  cachePosBootstrap(posProfile: string, configuration: Record<string, unknown>, syncedAt: string): void;
  getPosBootstrap(posProfile: string): Record<string, unknown> | null;
  cachePosProfile(name: string, profileData: Record<string, unknown>): string;
  getPosProfileCacheStatus(): PosProfileCacheStatus;
}

// Compile-time guarantee that today's SQLite-backed module still satisfies this contract.
// `import type` is erased at build time, so this adds no runtime dependency or coupling —
// if database.ts's exports ever drift from this interface, `tsc` fails here, not silently.
type CurrentDatabaseModule = typeof import("./database");
type AssertCurrentModuleImplementsContract = CurrentDatabaseModule extends IDatabaseService ? true : false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertImplemented: AssertCurrentModuleImplementsContract = true;
