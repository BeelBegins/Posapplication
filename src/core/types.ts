import type { IDatabaseService } from "../db/IDatabaseService";
import type { CredentialProvider } from "../api/client";

/**
 * Dependencies every src/core/ function is parameterized on, instead of importing
 * Electron or a concrete database module directly. This is what makes src/core/
 * reusable by a future non-Electron (e.g. Capacitor) shell: swap `db` for a different
 * IDatabaseService implementation and `fetch` for a platform-appropriate one, and the
 * business logic here is unchanged.
 *
 * `credentials` is optional and additive: Electron's main.ts never sets it, so every
 * authFetch() call (src/core/auth-fetch.ts) takes the terminal-token branch exactly as
 * before. Android's mobile.ts sets it to opt into Bearer/OAuth-session requests instead.
 */
export interface PosCoreDeps {
  db: IDatabaseService;
  fetch: typeof fetch;
  credentials?: CredentialProvider;
}

export interface PosProfileDetails {
  company: string;
  warehouse: string;
  branch: string;
  terminalId: string;
  customer: string;
  priceList: string;
  currency: string;
  paymentMethodsCount: number;
}

export interface PosProfileOption {
  name: string;
  company: string;
  warehouse: string;
}

export interface PosConfigurationSummary {
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

export interface PosSessionSummary {
  sessionStatus: "Open" | "Not Open";
  openingEntry: string;
  user: string;
  startDateTime: string;
  openingBalanceRowsCount: number;
  lastSynced: string | null;
}

export interface CashierLoginResult {
  success: boolean;
  user: string;
  fullName: string;
  roles: string[];
  allowedPosProfiles: string[];
  defaultPosProfile: string;
  canStartShift: boolean;
  canRefund: boolean;
  canCloseShift: boolean;
  canOfflineSale: boolean;
  offlineLoginExpiresAt: string;
  requirePinSetup: boolean;
  offlineCached?: boolean;
  offlineLogin?: boolean;
  error: string | null;
}

export interface ShiftPaymentRow {
  mode_of_payment: string;
  opening_amount: number;
  collected_amount: number;
  expected_amount: number;
  sale_amount?: number;
  refund_amount?: number;
  net_movement?: number;
}

export interface ShiftSummary {
  openingEntry: string; posProfile: string; user: string; company: string; periodStart: string; postingDate: string; status: string;
  payments: ShiftPaymentRow[]; invoiceCount: number; netSales: number; refunds: number; totalOpening: number; totalExpected: number; isEstimate: boolean;
}

export interface ReleaseEntry {
  tag: string; version: string; name: string; notes: string; publishedAt: string; prerelease: boolean;
  exeName: string; exeUrl: string; exeApiUrl: string;
}
