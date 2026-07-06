import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
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
  ,deleteAllHeldSales
  ,renameHeldSale
  ,listSalesHistory
  ,getSaleHistory
  ,recordReprint
  ,setSaleHistoryStatus
  ,saveShiftHistory
  ,listShiftHistory
  ,getShiftHistory
  ,getQueuedSales
  ,getQueueCounts
  ,cacheReceiptHtml
  ,getCachedReceiptHtml
  ,getMeta
  ,setMeta
  ,normalizeErpnextUrl
  ,logRefund
  ,getShiftRefundTotal
  ,getShiftRefundBreakdown
} from "./db/database";
import type { HeldSaleInput, SalesHistoryFilter, ShiftHistoryRow } from "./db/database";

let mainWindowRef: BrowserWindow | null = null;

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

interface CashierLoginResult {
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

function missingCashierLoginEndpointMessage(): string {
  return "Cashier login requires server endpoint aimatic.offline_pos.api.pos_cashier_login";
}

async function posCashierLogin(input: Record<string, unknown>): Promise<CashierLoginResult> {
  const settings = loadSettings();
  const username = normalizeCashierUser(textValue(input, "username"));
  const password = textValue(input, "password");
  const offlinePin = textValue(input, "offlinePin");
  const offlinePinConfirm = textValue(input, "offlinePinConfirm");
  const empty: CashierLoginResult = {
    success: false, user: "", fullName: "", roles: [], allowedPosProfiles: [], defaultPosProfile: "",
    canStartShift: false, canRefund: false, canCloseShift: false, canOfflineSale: false, offlineLoginExpiresAt: "",
    requirePinSetup: false, error: null
  };
  if (!username || !password) return { ...empty, error: "Cashier username and password are required." };
  if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !settings.terminalId || !settings.posProfile) {
    return { ...empty, error: "Terminal settings are required before cashier login." };
  }
  let base: URL;
  try { base = new URL(normalizeErpnextUrl(settings.erpnextUrl)); } catch { return { ...empty, error: "ERPNext URL is invalid." }; }
  const endpoint = `${base.toString().replace(/\/+$/, "")}/api/method/aimatic.offline_pos.api.pos_cashier_login`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, terminal_id: settings.terminalId, pos_profile: settings.posProfile })
    });
    const rawBody = await response.text();
    let parsed: { message?: unknown } = {};
    try { parsed = JSON.parse(rawBody) as { message?: unknown }; } catch { /* non-JSON */ }
    const raw = asRecord(parsed.message);
    const payload = asRecord(raw?.message) ?? raw ?? asRecord(parsed) ?? {};
    if (!response.ok) {
      const error = formatResponseError(response.status, response.statusText, rawBody);
      if (response.status === 404 || /pos_cashier_login|not found|has no attribute|does not exist|Failed to get method/i.test(error)) {
        return { ...empty, error: missingCashierLoginEndpointMessage() };
      }
      return { ...empty, error };
    }
    if (payload.success === false) return { ...empty, error: textValue(payload, "error") || "Cashier login failed." };
    const user = normalizeCashierUser(textValue(payload, "user") || textValue(payload, "email") || username);
    const fullName = textValue(payload, "full_name") || textValue(payload, "fullName") || user;
    const roles = Array.isArray(payload.roles) ? payload.roles.map(String) : [];
    const allowedPosProfiles = Array.isArray(payload.allowed_pos_profiles) ? payload.allowed_pos_profiles.map(String) : [];
    const canOfflineSale = payload.can_offline_sale === true;
    const offlineLoginExpiresAt = textValue(payload, "offline_login_expires_at");
    const requirePinSetup = canOfflineSale && !cashierCacheExists(user);
    const result: CashierLoginResult = {
      success: true,
      user,
      fullName,
      roles,
      allowedPosProfiles,
      defaultPosProfile: textValue(payload, "default_pos_profile"),
      canStartShift: Boolean(payload.can_start_shift ?? true),
      canRefund: Boolean(payload.can_refund ?? false),
      canCloseShift: Boolean(payload.can_close_shift ?? false),
      canOfflineSale,
      offlineLoginExpiresAt,
      requirePinSetup,
      error: null
    };
    if (canOfflineSale && requirePinSetup && !offlinePin) return { ...empty, requirePinSetup: true, error: "Create and confirm Offline Cashier PIN to enable offline selling for this cashier." };
    if (offlinePin && offlinePin !== offlinePinConfirm) return { ...empty, requirePinSetup: true, error: "Offline Cashier PIN confirmation does not match." };
    if (offlinePin) {
      const saved = cacheCashierOfflinePin(result, offlinePin);
      if (!saved.ok) return { ...empty, error: saved.error };
      result.offlineCached = true;
      result.requirePinSetup = false;
    }
    rememberCashierUser(user);
    return result;
  } catch (error) {
    return { ...empty, error: `Cashier login failed: ${error instanceof Error ? error.message : "network error"}` };
  }
}

function normalizeIdentityPart(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeCashierUser(user: string): string {
  return normalizeIdentityPart(user);
}

function cashierCacheKey(user: string): string {
  const settings = loadSettings();
  const identity = `${normalizeIdentityPart(settings.terminalId)}|${normalizeIdentityPart(settings.posProfile)}|${normalizeCashierUser(user)}`;
  return `cashier_offline_v1_${hashSecret(identity)}`;
}

function legacyCashierCacheKey(user: string): string {
  const settings = loadSettings();
  const identity = `${settings.terminalId.trim()}|${settings.posProfile.trim()}|${normalizeCashierUser(user)}`;
  return `cashier_offline_v1_${hashSecret(identity)}`;
}

function getCashierCacheRaw(user: string): string | null {
  return getMeta(cashierCacheKey(user)) || getMeta(legacyCashierCacheKey(user));
}

function rememberedCashiersKey(): string {
  const settings = loadSettings();
  return `cashier_remembered_v1_${hashSecret(`${normalizeIdentityPart(settings.terminalId)}|${normalizeIdentityPart(settings.posProfile)}`)}`;
}

function rememberedCashiers(): string[] {
  const raw = getMeta(rememberedCashiersKey());
  if (!raw) return [];
  try {
    const values = JSON.parse(raw) as unknown[];
    return Array.isArray(values) ? values.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function rememberCashierUser(user: string): void {
  const normalized = normalizeCashierUser(user);
  if (!normalized) return;
  const current = rememberedCashiers().filter((x) => x.toLowerCase() !== normalized);
  setMeta(rememberedCashiersKey(), JSON.stringify([normalized, ...current].slice(0, 5)));
}

function cashierCacheExists(user: string): boolean {
  return Boolean(getCashierCacheRaw(user));
}

function cashierFailedKey(user: string): string {
  return `${cashierCacheKey(user)}_failed`;
}

function cashierLockKey(user: string): string {
  return `${cashierCacheKey(user)}_lock`;
}

function cacheCashierOfflinePin(cashier: CashierLoginResult, pin: string): { ok: boolean; error: string | null } {
  const settings = loadSettings();
  const formatError = validatePinFormat(pin);
  if (formatError) return { ok: false, error: `Offline Cashier PIN: ${formatError}` };
  if (!settings.terminalId || !settings.posProfile || !cashier.user) return { ok: false, error: "Terminal and POS Profile are required before saving offline cashier PIN." };
  if (!cashier.canOfflineSale) return { ok: false, error: "This cashier is not allowed to use offline sales." };
  if (!cashier.offlineLoginExpiresAt) return { ok: false, error: "Server did not return offline login expiry for this cashier." };
  const cached = {
    user: normalizeCashierUser(cashier.user),
    fullName: cashier.fullName,
    roles: cashier.roles,
    allowedPosProfiles: cashier.allowedPosProfiles,
    defaultPosProfile: cashier.defaultPosProfile,
    canStartShift: cashier.canStartShift,
    canRefund: cashier.canRefund,
    canCloseShift: cashier.canCloseShift,
    canOfflineSale: cashier.canOfflineSale,
    lastOnlineVerifiedAt: new Date().toISOString(),
    offlineLoginExpiresAt: cashier.offlineLoginExpiresAt,
    terminalId: settings.terminalId.trim(),
    posProfile: settings.posProfile.trim(),
    pinHash: pinHash(pin)
  };
  const user = normalizeCashierUser(cashier.user);
  setMeta(cashierCacheKey(user), JSON.stringify(cached));
  setMeta(cashierFailedKey(user), "0");
  setMeta(cashierLockKey(user), "0");
  return { ok: true, error: null };
}

async function cashierOfflineLogin(input: Record<string, unknown>): Promise<CashierLoginResult> {
  const settings = loadSettings();
  const username = normalizeCashierUser(textValue(input, "username"));
  const pin = textValue(input, "pin");
  const empty: CashierLoginResult = {
    success: false, user: "", fullName: "", roles: [], allowedPosProfiles: [], defaultPosProfile: "",
    canStartShift: false, canRefund: false, canCloseShift: false, canOfflineSale: false, offlineLoginExpiresAt: "",
    requirePinSetup: false, error: null
  };
  if (!username || !pin) return { ...empty, error: "Cashier username and offline PIN are required." };
  if (!settings.terminalId || !settings.posProfile) return { ...empty, error: "Terminal settings are required before offline cashier login." };

  const lockUntil = Number(getMeta(cashierLockKey(username)) || 0);
  if (lockUntil > Date.now()) {
    return { ...empty, error: `Offline cashier PIN is locked. Try again in ${Math.ceil((lockUntil - Date.now()) / 1000)}s.` };
  }

  await new Promise((resolve) => setTimeout(resolve, ADMIN_PIN_DELAY_MS));
  const raw = getCashierCacheRaw(username);
  if (!raw) return { ...empty, error: "First cashier login requires internet. Login online once to enable offline selling for this cashier." };

  let cached: Record<string, unknown>;
  try {
    cached = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ...empty, error: "Saved offline cashier PIN is damaged. Login online to reset it." };
  }

  const stored = textValue(cached, "pinHash");
  if (normalizeIdentityPart(textValue(cached, "terminalId")) !== normalizeIdentityPart(settings.terminalId) || normalizeIdentityPart(textValue(cached, "posProfile")) !== normalizeIdentityPart(settings.posProfile) || !stored) {
    return { ...empty, error: "Offline cashier PIN is not valid for this terminal or POS Profile." };
  }
  const allowedProfiles = Array.isArray(cached.allowedPosProfiles) ? cached.allowedPosProfiles.map(String) : [];
  if (allowedProfiles.length && !allowedProfiles.map(normalizeIdentityPart).includes(normalizeIdentityPart(settings.posProfile))) return { ...empty, error: `Cashier is not allowed for POS Profile ${settings.posProfile}.` };
  if (cached.canOfflineSale !== true) return { ...empty, error: "Cashier is not allowed to sell offline." };
  const expiresAt = textValue(cached, "offlineLoginExpiresAt");
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
    return { ...empty, error: "Offline cashier login has expired. Login online once to renew offline selling for this cashier." };
  }

  if (!verifyPinHash(pin, stored)) {
    const failed = Number(getMeta(cashierFailedKey(username)) || 0) + 1;
    setMeta(cashierFailedKey(username), String(failed));
    if (failed >= ADMIN_PIN_MAX_ATTEMPTS) {
      setMeta(cashierLockKey(username), String(Date.now() + ADMIN_PIN_LOCK_MS));
      return { ...empty, error: "Too many wrong offline PIN attempts. Cashier login is locked for 5 minutes." };
    }
    return { ...empty, error: `Wrong offline Cashier PIN. ${ADMIN_PIN_MAX_ATTEMPTS - failed} attempt(s) remaining.` };
  }

  setMeta(cashierFailedKey(username), "0");
  setMeta(cashierLockKey(username), "0");
  rememberCashierUser(textValue(cached, "user") || username);
  return {
    success: true,
    user: textValue(cached, "user") || username,
    fullName: textValue(cached, "fullName") || username,
    roles: Array.isArray(cached.roles) ? cached.roles.map(String) : [],
    allowedPosProfiles: Array.isArray(cached.allowedPosProfiles) ? cached.allowedPosProfiles.map(String) : [],
    defaultPosProfile: textValue(cached, "defaultPosProfile"),
    canStartShift: Boolean(cached.canStartShift),
    canRefund: Boolean(cached.canRefund),
    canCloseShift: Boolean(cached.canCloseShift),
    canOfflineSale: Boolean(cached.canOfflineSale),
    offlineLoginExpiresAt: expiresAt,
    requirePinSetup: false,
    offlineLogin: true,
    error: null
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(record: Record<string, unknown> | null, key: string): string {
  return typeof record?.[key] === "string" ? record[key] as string : "";
}

function sameIdentity(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function unwrapFrappePayload(value: unknown): Record<string, unknown> {
  const root = asRecord(value) ?? {};
  const first = asRecord(root.message) ?? root;
  return asRecord(first.message) ?? first;
}

function sessionFromPayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const nested = asRecord(payload.session) ?? asRecord(payload.pos_opening_entry) ?? asRecord(payload.opening_entry_doc);
  if (nested) return nested;
  return textValue(payload, "opening_entry") || textValue(payload, "name") ? payload : null;
}

function matchingOpenEntry(entries: Record<string, unknown>[], posProfile: string, cashierUser: string): Record<string, unknown> | null {
  const matches = entries.filter((entry) => {
    const status = textValue(entry, "status") || "Open";
    const docstatus = entry.docstatus === undefined || entry.docstatus === null || entry.docstatus === "" ? 1 : Number(entry.docstatus);
    const profile = textValue(entry, "pos_profile");
    const user = textValue(entry, "user");
    return status === "Open"
      && docstatus === 1
      && (!profile || sameIdentity(profile, posProfile))
      && (!user || sameIdentity(user, cashierUser));
  });
  return matches.length === 1 ? matches[0] : null;
}

const LEGACY_ADMIN_PIN_HASH_KEY = "admin_pin_hash_v1";
const ADMIN_PIN_MIN_LENGTH = 4;
const ADMIN_PIN_MAX_ATTEMPTS = 5;
const ADMIN_PIN_LOCK_MS = 5 * 60_000;
const ADMIN_PIN_DELAY_MS = 900;
const ALLOW_HTTP_SUPERVISOR_AUTH = !app.isPackaged || process.env.POS_ALLOW_HTTP_SUPERVISOR_AUTH === "1";
const DEV_ADMIN_AUTH_BYPASS = !app.isPackaged || process.env.POS_DEV_ADMIN_AUTH_BYPASS === "1";
type AdminAction = "setup_pin" | "reset_pin" | "change_credentials" | "start_shift" | "close_shift" | "settings" | "force_sync" | "diagnostics";
type PinScope = "settings" | "shift";
let pendingAdminAuthorization: { tokenHash: string; action: AdminAction; pinScope: PinScope; terminalId: string; expiresAt: number } | null = null;

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pinHash(pin: string, salt = randomBytes(16).toString("hex")): string {
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `scrypt:v1:${salt}:${hash}`;
}

function verifyPinHash(pin: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "scrypt" || parts[1] !== "v1") return false;
  const expected = Buffer.from(parts[3], "hex");
  const actual = scryptSync(pin, parts[2], expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function pinScopeFromAction(action: AdminAction | string, requestedScope?: string): PinScope {
  if (requestedScope === "shift" || action === "start_shift" || action === "close_shift") return "shift";
  return "settings";
}

function pinHashKey(scope: PinScope): string { return `admin_pin_hash_v1_${scope}`; }
function pinFailedKey(scope: PinScope): string { return `admin_pin_failed_attempts_${scope}`; }
function pinLockKey(scope: PinScope): string { return `admin_pin_lock_until_${scope}`; }

function adminPinConfigured(scope: PinScope): boolean {
  return Boolean(getMeta(pinHashKey(scope)) || getMeta(LEGACY_ADMIN_PIN_HASH_KEY));
}

function adminLockState(scope: PinScope): { locked: boolean; lockUntil: number; secondsRemaining: number; failedAttempts: number } {
  const lockUntil = Number(getMeta(pinLockKey(scope)) || 0);
  const now = Date.now();
  return {
    locked: lockUntil > now,
    lockUntil,
    secondsRemaining: lockUntil > now ? Math.ceil((lockUntil - now) / 1000) : 0,
    failedAttempts: Number(getMeta(pinFailedKey(scope)) || 0)
  };
}

function adminStatus(input?: unknown): { configured: boolean; locked: boolean; secondsRemaining: number; failedAttempts: number; pinScope: PinScope } {
  const record = asRecord(input) ?? {};
  const scope = pinScopeFromAction(textValue(record, "action"), textValue(record, "pinScope"));
  const lock = adminLockState(scope);
  return { configured: adminPinConfigured(scope), locked: lock.locked, secondsRemaining: lock.secondsRemaining, failedAttempts: lock.failedAttempts, pinScope: scope };
}

function validatePinFormat(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return "PIN must contain digits only.";
  if (pin.length < ADMIN_PIN_MIN_LENGTH) return `PIN must be at least ${ADMIN_PIN_MIN_LENGTH} digits.`;
  if (pin.length > 12) return "PIN must be 12 digits or less.";
  return null;
}

function supervisorAuthNetworkError(error: unknown): string {
  const message = error instanceof Error ? error.message : "network error";
  if (/certificate|cert_|ssl|tls/i.test(message)) {
    return `Supervisor authorization failed: HTTPS certificate problem. Check SSL certificate validity for ERPNext URL. Details: ${message}`;
  }
  return `Supervisor authorization failed: ${message}`;
}

async function verifyAdminPin(input: Record<string, unknown>): Promise<{ ok: boolean; error: string | null; locked?: boolean; secondsRemaining?: number }> {
  const pin = textValue(input, "pin");
  const scope = pinScopeFromAction(textValue(input, "action"), textValue(input, "pinScope"));
  const lock = adminLockState(scope);
  const label = scope === "shift" ? "Shift PIN" : "Settings PIN";
  if (lock.locked) return { ok: false, error: `${label} is locked. Try again in ${lock.secondsRemaining}s.`, locked: true, secondsRemaining: lock.secondsRemaining };
  await new Promise((resolve) => setTimeout(resolve, ADMIN_PIN_DELAY_MS));
  const stored = getMeta(pinHashKey(scope)) || getMeta(LEGACY_ADMIN_PIN_HASH_KEY);
  if (!stored) return { ok: false, error: `${label} is not set.` };
  if (verifyPinHash(pin, stored)) {
    if (!getMeta(pinHashKey(scope))) setMeta(pinHashKey(scope), stored);
    setMeta(pinFailedKey(scope), "0");
    setMeta(pinLockKey(scope), "0");
    return { ok: true, error: null };
  }
  const failed = Number(getMeta(pinFailedKey(scope)) || 0) + 1;
  setMeta(pinFailedKey(scope), String(failed));
  if (failed >= ADMIN_PIN_MAX_ATTEMPTS) {
    const until = Date.now() + ADMIN_PIN_LOCK_MS;
    setMeta(pinLockKey(scope), String(until));
    return { ok: false, error: `Too many wrong PIN attempts. ${label} is locked for 5 minutes.`, locked: true, secondsRemaining: Math.ceil(ADMIN_PIN_LOCK_MS / 1000) };
  }
  return { ok: false, error: `Wrong ${label}. ${ADMIN_PIN_MAX_ATTEMPTS - failed} attempt(s) remaining.` };
}

function consumePendingAdminAuthorization(token: string, action: AdminAction, pinScope: PinScope): { ok: boolean; error: string | null } {
  const pending = pendingAdminAuthorization;
  pendingAdminAuthorization = null;
  const terminalId = loadSettings().terminalId;
  if (!pending) return { ok: false, error: "Supervisor authorization is missing or expired." };
  if (pending.expiresAt < Date.now()) return { ok: false, error: "Supervisor authorization expired." };
  if (pending.action !== action) return { ok: false, error: "Supervisor authorization was for a different action." };
  if (pending.pinScope !== pinScope) return { ok: false, error: "Supervisor authorization was for a different PIN." };
  if (pending.terminalId !== terminalId) return { ok: false, error: "Supervisor authorization was for a different terminal." };
  if (pending.tokenHash !== hashSecret(token)) return { ok: false, error: "Supervisor authorization token is invalid." };
  return { ok: true, error: null };
}

async function authorizePosAdminAction(input: Record<string, unknown>): Promise<{ ok: boolean; token: string; error: string | null }> {
  const settings = loadSettings();
  const action = textValue(input, "action") as AdminAction;
  const pinScope = pinScopeFromAction(action, textValue(input, "pinScope"));
  const username = textValue(input, "username");
  const password = textValue(input, "password");
  if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !settings.terminalId) return { ok: false, token: "", error: "Terminal settings are required before supervisor authorization." };
  if (!["setup_pin", "reset_pin", "change_credentials"].includes(action)) return { ok: false, token: "", error: "Invalid admin action." };
  if (!username || !password) return { ok: false, token: "", error: "Supervisor username and password are required." };
  if (DEV_ADMIN_AUTH_BYPASS) {
    const token = randomUUID();
    pendingAdminAuthorization = { tokenHash: hashSecret(token), action, pinScope, terminalId: settings.terminalId, expiresAt: Date.now() + 5 * 60_000 };
    return { ok: true, token, error: null };
  }
  let base: URL;
  const normalizedUrl = normalizeErpnextUrl(settings.erpnextUrl);
  try { base = new URL(normalizedUrl); } catch { return { ok: false, token: "", error: "ERPNext URL is invalid." }; }
  console.info("[AdminAuth] ERPNext URL diagnostic", { normalizedUrl: base.toString().replace(/\/+$/, ""), protocol: base.protocol });
  if (base.protocol !== "https:" && !ALLOW_HTTP_SUPERVISOR_AUTH) {
    return { ok: false, token: "", error: "Supervisor authorization requires HTTPS ERPNext URL." };
  }
  const endpoint = `${base.toString().replace(/\/+$/, "")}/api/method/aimatic.offline_pos.api.authorize_pos_admin_action`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, action, terminal_id: settings.terminalId })
    });
    const raw = await response.text();
    let parsed: { message?: unknown } = {};
    try { parsed = JSON.parse(raw) as { message?: unknown }; } catch { /* non-JSON */ }
    const payload = asRecord(parsed.message) ?? {};
    const token = textValue(payload, "token");
    if (!response.ok || !token) {
      const serverError = textValue(payload, "error") || textValue(payload, "message") || textValue(asRecord(parsed) ?? {}, "exception") || textValue(asRecord(parsed) ?? {}, "_server_messages");
      if (base.protocol === "https:" && /https is required|non-https|not https/i.test(serverError)) {
        return { ok: false, token: "", error: "Server rejected supervisor authorization as non-HTTPS. Check ERPNext proxy/HTTPS forwarding configuration." };
      }
      return { ok: false, token: "", error: serverError ? `Supervisor authorization failed: ${serverError}` : "Supervisor authorization failed." };
    }
    pendingAdminAuthorization = { tokenHash: hashSecret(token), action, pinScope, terminalId: settings.terminalId, expiresAt: Date.now() + 5 * 60_000 };
    return { ok: true, token, error: null };
  } catch (error) {
    return { ok: false, token: "", error: supervisorAuthNetworkError(error) };
  }
}

async function setAdminPin(input: Record<string, unknown>): Promise<{ ok: boolean; error: string | null }> {
  const pin = textValue(input, "pin");
  const confirmPin = textValue(input, "confirmPin");
  const action = textValue(input, "action") as AdminAction;
  const pinScope = pinScopeFromAction(action, textValue(input, "pinScope"));
  const currentPin = textValue(input, "currentPin");
  const token = textValue(input, "token");
  const formatError = validatePinFormat(pin);
  if (formatError) return { ok: false, error: formatError };
  if (pin !== confirmPin) return { ok: false, error: "PIN confirmation does not match." };
  if (action === "change_credentials" && adminPinConfigured(pinScope)) {
    const verified = await verifyAdminPin({ pin: currentPin, action, pinScope });
    if (!verified.ok) return { ok: false, error: verified.error };
  } else {
    const consumed = consumePendingAdminAuthorization(token, action, pinScope);
    if (!consumed.ok) return consumed;
  }
  setMeta(pinHashKey(pinScope), pinHash(pin));
  setMeta(pinFailedKey(pinScope), "0");
  setMeta(pinLockKey(pinScope), "0");
  return { ok: true, error: null };
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

async function syncPosSession(input: Record<string, unknown> = {}): Promise<{ success: boolean; summary: PosSessionSummary; error: string | null }> {
  const result = await getActivePosSession(input);
  return { success: result.success, summary: summarizePosSession(result.session), error: result.error };
}

async function getActivePosSession(input: Record<string, unknown> = {}): Promise<{ success:boolean; session:Record<string,unknown>|null; error:string|null; diagnosticReason:string; apiUser:string; requestedPosProfile:string; entries:Record<string,unknown>[] }> {
  const s = loadSettings();
  const cashierUser = textValue(input, "cashier_user");
  if (!s.erpnextUrl || !s.apiKey || !s.apiSecret) return { success:false, session:null, error:"Online connection required to load POS session.", diagnosticReason:"Missing ERPNext URL or API credentials", apiUser:"", requestedPosProfile:s.posProfile, entries:[] };
  if (!cashierUser) return { success:false, session:null, error:"Cashier user is required to load POS session.", diagnosticReason:"Cashier user missing", apiUser:"", requestedPosProfile:s.posProfile, entries:[] };
  try {
    const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
    const query = new URLSearchParams({ pos_profile: s.posProfile, cashier_user: cashierUser });
    const r = await fetch(`${base}/api/method/aimatic.offline_pos.api.get_active_pos_session?${query.toString()}`, { headers:{ Authorization:`token ${s.apiKey}:${s.apiSecret}` } });
    if (!r.ok) {
      const error = await getResponseError(r);
      return { success:false, session:null, error, diagnosticReason:error, apiUser:"", requestedPosProfile:s.posProfile, entries:[] };
    }
    const b = await r.json() as Record<string, unknown>;
    const payload = unwrapFrappePayload(b);
    const entries = (Array.isArray(payload.submitted_open_entries) ? payload.submitted_open_entries : Array.isArray(payload.open_entries) ? payload.open_entries : []).map(asRecord).filter((x): x is Record<string, unknown> => Boolean(x));
    const session = sessionFromPayload(payload) ?? matchingOpenEntry(entries, s.posProfile, cashierUser);
    const diagnosticReason = textValue(payload, "diagnostic_reason") || textValue(payload, "reason") || (session ? "Active session returned" : "No active POS Opening Entry returned by server");
    const apiUser = textValue(payload, "authenticated_user") || textValue(payload, "api_user");
    if (session) {
      const entry = textValue(session, "opening_entry") || textValue(session, "name");
      if (entry) cachePosSession(entry, s.posProfile, textValue(session, "user") || cashierUser, session, new Date().toISOString());
    }
    return { success:true, session, error:null, diagnosticReason, apiUser, requestedPosProfile:textValue(payload, "requested_pos_profile") || textValue(payload, "pos_profile") || s.posProfile, entries };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unable to load POS session.";
    return { success:false, session:null, error, diagnosticReason:error, apiUser:"", requestedPosProfile:s.posProfile, entries:[] };
  }
}

async function startPosSession(input:Record<string,unknown>):Promise<{success:boolean;session:Record<string,unknown>|null;error:string|null}>{
  const s=loadSettings();
  if(!s.erpnextUrl||!s.apiKey||!s.apiSecret)return {success:false,session:null,error:"Online connection required to start shift"};
  const cashierUser=textValue(input,"cashier_user");
  if(!cashierUser)return {success:false,session:null,error:"Cashier user is required to start shift"};
  try{
    const base=new URL(s.erpnextUrl).toString().replace(/\/+$/,"");
    const r=await fetch(`${base}/api/method/aimatic.offline_pos.api.start_pos_session`,{method:"POST",headers:{Authorization:`token ${s.apiKey}:${s.apiSecret}`,"Content-Type":"application/json"},body:JSON.stringify({pos_profile:s.posProfile,opening_balances:JSON.stringify(Array.isArray(input.opening_balances)?input.opening_balances:[]),cashier_user:cashierUser,local_offline_session_id:textValue(input,"local_offline_session_id")})});
    if(!r.ok){
      const body = await r.clone().json().catch(() => null) as unknown;
      const payload = unwrapFrappePayload(body);
      const entries = (Array.isArray(payload.submitted_open_entries) ? payload.submitted_open_entries : Array.isArray(payload.open_entries) ? payload.open_entries : []).map(asRecord).filter((x): x is Record<string, unknown> => Boolean(x));
      const session = sessionFromPayload(payload) ?? matchingOpenEntry(entries, s.posProfile, cashierUser);
      const entry = textValue(session, "opening_entry") || textValue(session, "name");
      if (session && entry) {
        cachePosSession(entry, s.posProfile, textValue(session, "user") || cashierUser, session, new Date().toISOString());
        return { success: true, session, error: null };
      }
      return {success:false,session:null,error:await getResponseError(r)};
    }
    const b=await r.json() as Record<string,unknown>;
    const payload=unwrapFrappePayload(b);
    const entries=(Array.isArray(payload.submitted_open_entries)?payload.submitted_open_entries:Array.isArray(payload.open_entries)?payload.open_entries:[]).map(asRecord).filter((x):x is Record<string,unknown>=>Boolean(x));
    const session=sessionFromPayload(payload)??matchingOpenEntry(entries,s.posProfile,cashierUser);
    const entry=textValue(session,"opening_entry")||textValue(session,"name");
    if(!session||!entry)return {success:false,session:null,error:"Server returned no Opening Entry."};
    cachePosSession(entry,s.posProfile,textValue(session,"user")||cashierUser,session,new Date().toISOString());
    return {success:true,session,error:null};
  }catch(e){return {success:false,session:null,error:e instanceof Error?e.message:"Unable to start shift."};}
}

interface ShiftPaymentRow { mode_of_payment: string; opening_amount: number; collected_amount: number; expected_amount: number; sale_amount?: number; refund_amount?: number; net_movement?: number; }
interface ShiftSummary {
  openingEntry: string; posProfile: string; user: string; company: string; periodStart: string; postingDate: string; status: string;
  payments: ShiftPaymentRow[]; invoiceCount: number; netSales: number; refunds: number; totalOpening: number; totalExpected: number; isEstimate: boolean;
}

function paymentModeText(row: ShiftPaymentRow): string {
  return String(row.mode_of_payment ?? "");
}

function hasPaymentBreakdown(summary: ShiftSummary): boolean {
  return summary.payments.some((row) => row.sale_amount !== undefined || row.refund_amount !== undefined || row.net_movement !== undefined);
}

function applyLocalRefundBreakdown(summary: ShiftSummary, openingEntry: string, collectedAmountIsNet = true): ShiftSummary {
  if (hasPaymentBreakdown(summary)) return summary;
  const rawBreakdown = getShiftRefundBreakdown(openingEntry);
  const totalRefund = Object.values(rawBreakdown).reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0);
  if (totalRefund <= 0) return summary;

  const modes = summary.payments.map(paymentModeText).filter(Boolean);
  const cashMode = modes.find((mode) => mode.toLowerCase().includes("cash")) ?? modes[0] ?? "";
  const refundByMode = new Map<string, number>();
  for (const [mode, amount] of Object.entries(rawBreakdown)) {
    const targetMode = mode && modes.includes(mode) ? mode : cashMode;
    refundByMode.set(targetMode, (refundByMode.get(targetMode) ?? 0) + Math.abs(Number(amount) || 0));
  }

  const payments = summary.payments.map((row) => {
    const mode = paymentModeText(row);
    const opening = numValue(row as unknown as Record<string, unknown>, "opening_amount");
    const collected = numValue(row as unknown as Record<string, unknown>, "collected_amount");
    const refund = -Math.abs(refundByMode.get(mode) ?? 0);
    const net = collectedAmountIsNet ? collected : collected + refund;
    const sale = collectedAmountIsNet ? net - refund : collected;
    const expected = row.expected_amount !== undefined && collectedAmountIsNet ? row.expected_amount : opening + net;
    return {
      ...row,
      opening_amount: opening,
      sale_amount: sale,
      refund_amount: refund,
      net_movement: net,
      collected_amount: net,
      expected_amount: expected
    };
  });

  return {
    ...summary,
    payments,
    netSales: payments.reduce((sum, row) => sum + (row.sale_amount ?? 0), 0),
    refunds: payments.reduce((sum, row) => sum + (row.refund_amount ?? 0), 0),
    totalOpening: payments.reduce((sum, row) => sum + row.opening_amount, 0),
    totalExpected: payments.reduce((sum, row) => sum + row.expected_amount, 0)
  };
}

function numValue(record: Record<string, unknown> | null, ...keys: string[]): number {
  for (const key of keys) { const v = record?.[key]; if (typeof v === "number") return v; if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v); }
  return 0;
}

// Build a Close Shift summary from local data only (cached Opening Entry balances + submitted sales for this shift).
// Authoritative reconciliation happens server-side on close; these figures are the cashier's local estimate.
function getLocalShiftSummary(openingEntry?: string): { success: boolean; summary: ShiftSummary | null; error: string | null } {
  const settings = loadSettings();
  const session = getCachedPosSession(settings.posProfile);
  if (!session) return { success: false, summary: null, error: "No cached POS Opening Entry — refresh the session first." };
  const entry = textValue(session, "name") || textValue(session, "opening_entry");
  if (openingEntry && entry && openingEntry !== entry) {
    return { success: false, summary: null, error: `Cached shift is ${entry}, not ${openingEntry}. Refresh the session.` };
  }
  const openingByMode = new Map<string, number>();
  const balances = Array.isArray(session.balance_details) ? session.balance_details : [];
  for (const row of balances) { const r = asRecord(row); const mode = textValue(r, "mode_of_payment"); if (mode) openingByMode.set(mode, numValue(r, "opening_amount")); }
  // Ensure every POS Profile payment method is present even with a zero opening balance.
  for (const mode of getPaymentMethods()) if (!openingByMode.has(mode)) openingByMode.set(mode, 0);

  const collectedByMode = new Map<string, number>();
  let invoiceCount = 0; let netSales = 0;
  const history = listSalesHistory({ limit: 200 });
  for (const sale of history) {
    if (sale.status !== "Submitted") continue;
    const payload = sale.payload;
    if (!payload || textValue(payload, "opening_entry") !== entry) continue;
    invoiceCount += 1;
    const payments = Array.isArray(payload.payments) ? payload.payments : [];
    for (const p of payments) { const pr = asRecord(p); const mode = textValue(pr, "mode_of_payment"); if (!mode) continue; const amount = numValue(pr, "amount"); collectedByMode.set(mode, (collectedByMode.get(mode) ?? 0) + amount); netSales += amount; if (!openingByMode.has(mode)) openingByMode.set(mode, 0); }
  }

  const payments: ShiftPaymentRow[] = [...openingByMode.keys()].sort().map((mode) => {
    const opening_amount = openingByMode.get(mode) ?? 0;
    const collected_amount = collectedByMode.get(mode) ?? 0;
    return { mode_of_payment: mode, opening_amount, collected_amount, expected_amount: opening_amount + collected_amount };
  });
  const summary: ShiftSummary = {
    openingEntry: entry, posProfile: textValue(session, "pos_profile") || settings.posProfile, user: textValue(session, "user"),
    company: textValue(session, "company"), periodStart: textValue(session, "period_start_date") || textValue(session, "posting_date") || textValue(session, "creation"),
    postingDate: textValue(session, "posting_date"), status: textValue(session, "status") || "Open",
    payments, invoiceCount, netSales, refunds: getShiftRefundTotal(entry), totalOpening: payments.reduce((s, p) => s + p.opening_amount, 0), totalExpected: payments.reduce((s, p) => s + p.expected_amount, 0), isEstimate: true
  };
  return { success: true, summary: applyLocalRefundBreakdown(summary, entry, false), error: null };
}

async function getShiftSummary(input: string | Record<string, unknown> = {}): Promise<{ success: boolean; summary: ShiftSummary | null; error: string | null }> {
  const s = loadSettings();
  const request = typeof input === "string" ? { opening_entry: input } : input;
  const openingEntry = textValue(request, "opening_entry");
  const cashierUser = textValue(request, "cashier_user");
  if (!s.erpnextUrl || !s.apiKey || !s.apiSecret) return getLocalShiftSummary(openingEntry);
  if (!openingEntry) return { success: false, summary: null, error: "Opening Entry is required." };
  if (!cashierUser) return { success: false, summary: null, error: "Cashier user is required to load closing summary." };
  try {
    const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
    const query = new URLSearchParams({ opening_entry: openingEntry, cashier_user: cashierUser });
    const r = await fetch(`${base}/api/method/aimatic.offline_pos.api.get_pos_closing_summary?${query.toString()}`, {
      headers: { Authorization: `token ${s.apiKey}:${s.apiSecret}` }
    });
    if (!r.ok) return { success: false, summary: null, error: await getResponseError(r) };
    const b = await r.json() as { message?: unknown };
    const raw = asRecord(b.message);
    const summary = asRecord(raw?.message) ?? raw;
    return summary ? { success: true, summary: applyLocalRefundBreakdown(summary as unknown as ShiftSummary, openingEntry, true), error: null } : { success: false, summary: null, error: "Shift summary was not returned." };
  } catch (e) {
    return { success: false, summary: null, error: e instanceof Error ? e.message : "Unable to load server shift summary." };
  }
}

// Submit the POS Closing Entry via the server (aimatic.offline_pos.api.close_pos_session). Online-only.
async function closeShift(input: Record<string, unknown>): Promise<{ success: boolean; closingEntry: string; response: Record<string, unknown> | null; error: string | null }> {
  const s = loadSettings();
  if (!s.erpnextUrl || !s.apiKey || !s.apiSecret) return { success: false, closingEntry: "", response: null, error: "Online connection required to close shift." };
  const openingEntry = textValue(input, "opening_entry");
  const cashierUser = textValue(input, "cashier_user");
  if (!openingEntry) return { success: false, closingEntry: "", response: null, error: "Opening Entry is required to close the shift." };
  if (!cashierUser) return { success: false, closingEntry: "", response: null, error: "Cashier user is required to close the shift." };
  const closingBalances = Array.isArray(input.closing_balances) ? input.closing_balances : [];
  const notes = textValue(input, "notes");
  // Snapshot the local expected/opening figures before the close so we can persist shift history on success.
  const pre = await getShiftSummary({ opening_entry: openingEntry, cashier_user: cashierUser });
  try {
    const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
    const r = await fetch(`${base}/api/method/aimatic.offline_pos.api.close_pos_session`, {
      method: "POST",
      headers: { Authorization: `token ${s.apiKey}:${s.apiSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ opening_entry: openingEntry, cashier_user: cashierUser, closing_balances: JSON.stringify(closingBalances), notes })
    });
    if (!r.ok) return { success: false, closingEntry: "", response: null, error: await getResponseError(r) };
    const b = await r.json() as { message?: unknown };
    const raw = asRecord(b.message);
    const response = asRecord(raw?.message) ?? raw ?? {};
    const closingEntry = textValue(response, "closing_entry") || textValue(response, "name") || textValue(asRecord(response.pos_closing_entry), "name");
    persistClosedShift(openingEntry, closingEntry, closingBalances, pre.summary, response);
    const deletedHeldSales = deleteAllHeldSales();
    return { success: true, closingEntry, response: { ...response, deleted_held_sales: deletedHeldSales }, error: null };
  } catch (e) {
    return { success: false, closingEntry: "", response: null, error: e instanceof Error ? e.message : "Unable to close shift." };
  }
}

function persistClosedShift(openingEntry: string, closingEntry: string, closingBalances: unknown[], summary: ShiftSummary | null, response: Record<string, unknown>): void {
  try {
    const actualByMode = new Map<string, number>();
    for (const row of closingBalances) { const r = asRecord(row); const mode = textValue(r, "mode_of_payment"); if (mode) actualByMode.set(mode, numValue(r, "closing_amount")); }
    const isCash = (mode: string) => mode.toLowerCase().includes("cash");
    const cashRow = summary?.payments.find((p) => isCash(p.mode_of_payment));
    const openingCash = cashRow?.opening_amount ?? summary?.totalOpening ?? 0;
    const expectedCash = cashRow?.expected_amount ?? summary?.totalExpected ?? 0;
    const actualCash = cashRow ? (actualByMode.get(cashRow.mode_of_payment) ?? 0) : [...actualByMode.values()].reduce((a, b) => a + b, 0);
    saveShiftHistory({
      openingEntry, closingEntry: closingEntry || null, posProfile: summary?.posProfile ?? loadSettings().posProfile,
      cashier: summary?.user ?? "", company: summary?.company ?? "", openedAt: summary?.periodStart ?? null, closedAt: new Date().toISOString(),
      openingCash, expectedCash, actualCash, difference: actualCash - expectedCash, netSales: summary?.netSales ?? 0, status: "Closed",
      summary: { summary, closing_balances: closingBalances, response }
    });
  } catch { /* shift-history persistence is best-effort; never block a successful close */ }
}

function getShiftHistoryList(): ShiftHistoryRow[] { return listShiftHistory(100); }

function getCachedSessionSummary(): PosSessionSummary {
  return summarizePosSession(getCachedPosSession(loadSettings().posProfile));
}

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function getOfflineBatchId(terminalId: string): string {
  const key = `offline_batch_${terminalId}_${todayKey()}`;
  const existing = getMeta(key);
  if (existing) return existing;
  const id = `OFFLINE-${terminalId}-${todayKey()}-${randomUUID()}`;
  setMeta(key, id);
  return id;
}

function isOfflineBatchId(value: string): boolean {
  return value.trim().toUpperCase().startsWith("OFFLINE-");
}

function realOpeningEntry(value: string): string {
  const openingEntry = value.trim();
  return isOfflineBatchId(openingEntry) ? "" : openingEntry;
}

function getCartIdentity(): { terminalId: string; openingEntry: string; offlineBatchId: string } {
  const settings = loadSettings();
  const session = getCachedSessionSummary();
  const terminalId = settings.terminalId || "default-terminal";
  const openingEntry = realOpeningEntry(session.openingEntry || "");
  return { terminalId, openingEntry, offlineBatchId: openingEntry ? "" : getOfflineBatchId(terminalId) };
}
function getTerminalInvoiceId():string{const id=getCartIdentity();return getOpenTerminalInvoice(id.terminalId,()=>`${id.terminalId}-${randomUUID()}`);}
// Build the canonical sale submission payload (shared by online submit and offline queue).
function buildSalePayload(input: Record<string, unknown>): Record<string, unknown> {
  const settings = loadSettings();
  const id = String(input.terminal_invoice_id || getTerminalInvoiceId());
  const identity = getCartIdentity();
  const requestedOpening = String(input.opening_entry || identity.openingEntry || "");
  const offlineAuthenticated = Boolean(input.offline_authenticated);
  const openingEntry = offlineAuthenticated ? "" : realOpeningEntry(requestedOpening);
  let localOfflineSessionId = String(input.local_offline_session_id || "").trim();
  if (!localOfflineSessionId && isOfflineBatchId(requestedOpening)) localOfflineSessionId = requestedOpening.trim();
  if (!localOfflineSessionId && offlineAuthenticated) localOfflineSessionId = identity.offlineBatchId || getOfflineBatchId(identity.terminalId);
  return {
    terminal_invoice_id: id,
    terminal_id: identity.terminalId,
    pos_profile: settings.posProfile,
    opening_entry: openingEntry,
    local_offline_session_id: localOfflineSessionId,
    cashier_user: String(input.cashier_user ?? ""),
    cashier_full_name: String(input.cashier_full_name ?? ""),
    offline_authenticated: Boolean(input.offline_authenticated),
    offline_auth_method: String(input.offline_auth_method ?? ""),
    created_at: String(input.created_at ?? new Date().toISOString()),
    customer: String(input.customer ?? ""),
    items: Array.isArray(input.items) ? input.items : [],
    payments: Array.isArray(input.payments) ? input.payments : [],
    coupon_code: String(input.coupon_code ?? ""),
    gift_voucher_code: String(input.gift_voucher_code ?? ""),
    redeem_loyalty_points: Boolean(input.redeem_loyalty_points),
    loyalty_points: Number(input.loyalty_points ?? 0),
    estimated_total: Number(input.estimated_total ?? 0)
  };
}
// A local stand-in for the server response so the receipt + history have coherent data until the sale syncs.
function buildProvisionalResponse(id: string, payload: Record<string, unknown>): Record<string, unknown> {
  return { provisional: true, offline: true, queued: true, terminal_invoice_id: id, pos_invoice: id, posting_datetime: new Date().toISOString(), fbr_status: "Awaiting internet availability", fbr_invoice_number: "Pending", fbr_response: "Will submit automatically when ERPNext is online", estimated_total: numValue(payload, "estimated_total") };
}
// Persist a completed-offline sale to the queue (status "Queued"); it replays to the server on reconnect.
function queueSale(input: Record<string, unknown>): { success: boolean; response: Record<string, unknown> | null; error: string | null; queued: boolean } {
  const payload = buildSalePayload(input);
  const id = String(payload.terminal_invoice_id);
  const response = buildProvisionalResponse(id, payload);
  saveSaleHistory(id, "Queued", payload, response);
  return { success: true, response, error: null, queued: true };
}

async function submitOnlineSale(input:Record<string,unknown>):Promise<{success:boolean;response:Record<string,unknown>|null;error:string|null;queued?:boolean}>{const settings=loadSettings();const payload=buildSalePayload(input);const id=String(payload.terminal_invoice_id);saveSaleHistory(id,"Submitting",payload);if(!settings.erpnextUrl||!settings.apiKey||!settings.apiSecret){saveSaleHistory(id,"Failed",payload);return {success:false,response:null,error:"ERPNext URL and API credentials are required."};}try{const base=new URL(settings.erpnextUrl).toString().replace(/\/+$/,"");const response=await fetch(`${base}/api/method/aimatic.offline_pos.api.submit_online_sale`,{method:"POST",headers:{Authorization:`token ${settings.apiKey}:${settings.apiSecret}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});const rawBody=await response.text();let parsed:{message?:unknown;data?:unknown}={};try{parsed=JSON.parse(rawBody) as {message?:unknown;data?:unknown};}catch{/* non-JSON response */}const result=asRecord(parsed.message)??asRecord(parsed.data)??{};if(!response.ok){saveSaleHistory(id,"Failed",payload,result);return {success:false,response:result,error:formatResponseError(response.status,response.statusText,rawBody)};}saveSaleHistory(id,"Submitted",payload,result);return {success:true,response:result,error:null};}catch(error){/* Network failure mid-submit: auto-fall back to the offline queue rather than failing the sale. */const response=buildProvisionalResponse(id,payload);saveSaleHistory(id,"Queued",payload,response);return {success:true,response,error:null,queued:true};}}

async function openingEntryForQueuedPayload(payload: Record<string, unknown>, cache: Map<string, string>): Promise<{ openingEntry: string | null; error: string | null }> {
  const current = textValue(payload, "opening_entry");
  const batch = textValue(payload, "local_offline_session_id") || (isOfflineBatchId(current) ? current : "");
  if (current && !isOfflineBatchId(current)) return { openingEntry: current, error: null };
  if (!batch) return { openingEntry: null, error: "Queued sale is missing local_offline_session_id and real POS Opening Entry." };
  const cashierUser = textValue(payload, "cashier_user");
  if (!cashierUser) return { openingEntry: null, error: "Queued sale is missing cashier_user." };
  const cacheKey = `${batch}|${cashierUser}`;
  if (cache.has(cacheKey)) return { openingEntry: cache.get(cacheKey) || null, error: null };
  const result = await startPosSession({ opening_balances: [], cashier_user: cashierUser, local_offline_session_id: batch });
  if (!result.success || !result.session) return { openingEntry: null, error: result.error || "Unable to create POS Opening Entry for offline batch." };
  const openingEntry = textValue(result.session, "opening_entry") || textValue(result.session, "name");
  if (!openingEntry) return { openingEntry: null, error: "Server returned no POS Opening Entry for offline batch." };
  cache.set(cacheKey, openingEntry);
  return { openingEntry, error: null };
}

function isCashierPermissionSyncError(message: string): boolean {
  return /cashier|user|employee|permission|disabled|not allowed|not permitted|pos profile/i.test(message);
}

// Replay queued offline sales to the server in order. Idempotent via terminal_invoice_id (server dedups).
async function syncSaleQueue(): Promise<{ synced: number; failed: number; remaining: number; error: string | null }> {
  const settings = loadSettings();
  const counts0 = getQueueCounts();
  if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret) return { synced: 0, failed: 0, remaining: counts0.queued, error: "ERPNext URL and API credentials are required." };
  const auth = await testApiAuthentication();
  if (!auth.success) return { synced: 0, failed: 0, remaining: counts0.queued, error: "Terminal API credentials could not be revalidated." };
  let base: string;
  try { base = new URL(settings.erpnextUrl).toString().replace(/\/+$/, ""); } catch { return { synced: 0, failed: 0, remaining: counts0.queued, error: "Invalid ERPNext URL." }; }
  let synced = 0; let failed = 0; let error: string | null = null;
  const openingCache = new Map<string, string>();
  for (const sale of getQueuedSales()) {
    const payload = { ...sale.payload };
    try {
      const opening = await openingEntryForQueuedPayload(payload, openingCache);
      if (opening.error || !opening.openingEntry) { failed += 1; error = opening.error || "Unable to prepare POS Opening Entry for queued sale."; break; }
      if (isOfflineBatchId(opening.openingEntry)) { failed += 1; error = "Offline batch ID could not be converted to a real POS Opening Entry."; break; }
      payload.opening_entry = opening.openingEntry;
      const response = await fetch(`${base}/api/method/aimatic.offline_pos.api.submit_online_sale`, { method: "POST", headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const rawBody = await response.text();
      let parsed: { message?: unknown; data?: unknown } = {};
      try { parsed = JSON.parse(rawBody) as { message?: unknown; data?: unknown }; } catch { /* non-JSON */ }
      const result = asRecord(parsed.message) ?? asRecord(parsed.data) ?? {};
      if (!response.ok) {
        failed += 1;
        error = formatResponseError(response.status, response.statusText, rawBody);
        if (isCashierPermissionSyncError(error)) {
          setSaleHistoryStatus(sale.terminalInvoiceId, "Needs Supervisor Review");
          error = `${error}. Queued sale marked Needs Supervisor Review.`;
        }
        break;
      }
      saveSaleHistory(sale.terminalInvoiceId, "Submitted", payload, result); synced += 1;
    } catch (e) { error = e instanceof Error ? e.message : "Still offline."; break; }
  }
  return { synced, failed, remaining: getQueueCounts().queued, error };
}
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
function thermalReceiptCss(): string {
  return `<style>
    @page { size: 80mm auto; margin: 2mm; }
    @media print {
      html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
      button, input, select, textarea, .btn, .print-toolbar, .page-head, .navbar, #navbar, .web-footer, footer,
      .btn-print-preview, .print-preview-select, .print-preview-toolbar, .print-actions,
      a[href*="download_pdf"], a[href*="pdf"] { display: none !important; }
      .rc-item, .rc-totals, .rc-fbr, .rc-footer { break-inside: avoid; page-break-inside: avoid; }
    }
    html, body, .print-format, .pos-receipt {
      font-family: Calibri, Arial, sans-serif !important;
      color: #000 !important;
      background: #fff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-variant-numeric: tabular-nums;
    }
    body { margin: 0 !important; padding: 0 !important; }
    .print-format, .pos-receipt {
      width: 80mm !important; max-width: 80mm !important; margin: 0 auto !important;
      padding: 3mm 3mm 4mm !important; box-sizing: border-box !important;
      font-size: 11px !important; line-height: 1.35 !important;
    }
    .rc-company { font-size: 18px !important; font-weight: 800 !important; color: #000 !important; }
    .rc-title { font-size: 15px !important; font-weight: 800 !important; color: #000 !important; }
    .rc-meta, .rc-meta-row, .rc-fbr-row, .rc-fbr-inv { font-size: 11px !important; color: #000 !important; font-weight: 700 !important; }
    .rc-meta-lbl, .rc-item-code, .rc-item-nums .c-desc, .rc-terms, .rc-footer { color: #000 !important; }
    .rc-col-hdr { display: grid !important; grid-template-columns: minmax(0,1fr) 16mm 20mm 22mm !important; gap: 1.5mm !important; font-size: 10px !important; color: #000 !important; font-weight: 800 !important; }
    .rc-item-name { font-size: 11px !important; font-weight: 800 !important; color: #000 !important; overflow: visible !important; display: block !important; }
    .rc-item-nums { display: grid !important; grid-template-columns: minmax(0,1fr) 16mm 20mm 22mm !important; gap: 1.5mm !important; font-size: 10px !important; color: #000 !important; font-weight: 700 !important; }
    .rc-item-nums .c-num, .rc-col-hdr .c-num { width: auto !important; text-align: right !important; white-space: nowrap !important; }
    .rc-item { padding: 2px 1px !important; border-bottom: 1px dotted #999 !important; }
    .rc-item-code { display: none !important; }
    .rc-item-tax { margin-top: 1px !important; padding: 1px 2px !important; border-left: 0 !important; background: transparent !important; font-size: 9.5px !important; line-height: 1.15 !important; color: #000 !important; font-weight: 800 !important; }
    .rc-item-tax-3rd, .rc-item-disc { display: none !important; }
    .rc-tot-row { font-size: 12px !important; color: #000 !important; font-weight: 700 !important; }
    .rc-tot-row.grand { font-size: 16px !important; font-weight: 900 !important; color: #000 !important; }
    .rc-tot-amt { white-space: nowrap !important; font-variant-numeric: tabular-nums; }
    .rc-fbr-title { font-size: 12px !important; font-weight: 900 !important; color: #000 !important; }
    .rc-fbr-inv b, .rc-fbr-row span:last-child { font-weight: 900 !important; color: #000 !important; }
    .rc-footer { font-size: 10px !important; color: #000 !important; }
    .rc-fbr-qr img, .rc-gv-qr img, .receipt-qr-img { width: 70px !important; height: 70px !important; image-rendering: crisp-edges; }
    .duplicate-copy, .return-copy { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; font: 900 15px Calibri, Arial, sans-serif !important; border: 2px solid #000 !important; color: #000 !important; padding: 5px !important; margin: 0 0 6px !important; letter-spacing: 1px !important; text-transform: uppercase !important; break-after: avoid !important; page-break-after: avoid !important; }
  </style>`;
}

async function getPosReceipt(posInvoice: string): Promise<{ html: string | null; error: string | null }> {
  const s = loadSettings();
  if (!posInvoice.trim()) return { html: null, error: "Missing POS Invoice name." };
  const cached = getCachedReceiptHtml(posInvoice);
  if (!s.erpnextUrl || !s.apiKey || !s.apiSecret) return cached ? { html: cached, error: null } : { html: null, error: "Online connection required to load receipt." };
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
    const hideChrome = thermalReceiptCss();
    const clean = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${hideChrome}</head>`) : hideChrome + html;
    cacheReceiptHtml(posInvoice, clean);
    return { html: clean, error: null };
  } catch (e) {
    if (cached) return { html: cached, error: null };
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
  const banner = `<div class="duplicate-copy">DUPLICATE COPY<br>Invoice ${posInvoice}<br>Reprinted ${new Date().toLocaleString()}</div>`;
  let html = base.html;
  if (/<div\b[^>]*class=["'][^"']*\bpos-receipt\b[^"']*["'][^>]*>/i.test(html)) {
    html = html.replace(/(<div\b[^>]*class=["'][^"']*\bpos-receipt\b[^"']*["'][^>]*>)/i, `$1${banner}`);
  } else if (/<div\b[^>]*class=["'][^"']*\bprint-format\b[^"']*["'][^>]*>/i.test(html)) {
    html = html.replace(/(<div\b[^>]*class=["'][^"']*\bprint-format\b[^"']*["'][^>]*>)/i, `$1${banner}`);
  } else {
    html = /<body[^>]*>/i.test(html) ? html.replace(/(<body[^>]*>)/i, `$1<div class="pos-receipt">${banner}`) : `<div class="pos-receipt">${banner}${html}</div>`;
    if (/<body[^>]*>/i.test(html)) html = html.replace(/<\/body>/i, "</div></body>");
  }
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

// Online refund: read original invoice + refundable quantities from the server (authoritative).
async function getInvoiceForRefund(invoiceName: string): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const s = loadSettings();
  if (!s.erpnextUrl || !s.apiKey || !s.apiSecret) return { data: null, error: "Online connection required to load the invoice." };
  try {
    const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
    const response = await fetch(`${base}/api/method/aimatic.offline_pos.api.get_pos_invoice_for_refund?invoice_name=${encodeURIComponent(invoiceName)}`, {
      headers: { Authorization: `token ${s.apiKey}:${s.apiSecret}` }
    });
    if (!response.ok) return { data: null, error: await getResponseError(response) };
    const body = await response.json() as { message?: unknown };
    const data = asRecord(body.message);
    return data ? { data, error: null } : { data: null, error: "Invoice data was not returned." };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Unable to load invoice." };
  }
}

// Online refund submission. Electron never calls FBR — the server return hook handles FBR once.
async function submitPosRefund(input: Record<string, unknown>): Promise<{ result: Record<string, unknown> | null; error: string | null }> {
  const s = loadSettings();
  if (!s.erpnextUrl || !s.apiKey || !s.apiSecret) return { result: null, error: "Online connection required to submit a refund." };
  try {
    const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
    const response = await fetch(`${base}/api/method/aimatic.offline_pos.api.submit_pos_refund`, {
      method: "POST",
      headers: { Authorization: `token ${s.apiKey}:${s.apiSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    const rawBody = await response.text();
    let parsed: { message?: unknown } = {};
    try { parsed = JSON.parse(rawBody) as { message?: unknown }; } catch { /* non-JSON */ }
    const result = asRecord(parsed.message);
    if (!response.ok) return { result: result ?? null, error: formatResponseError(response.status, response.statusText, rawBody) };
    if (result && result.success === true) {
      // Record the refund locally so the shift summary can report a Refunds total (refunds aren't in pos_sales_history).
      const invoice = asRecord(result.invoice) ?? {};
      const returnInvoice = textValue(invoice, "name") || textValue(result, "name");
      const amount = Math.abs(numValue(invoice, "grand_total") || numValue(invoice, "rounded_total") || numValue(result, "grand_total") || numValue(result, "refund_total") || 0);
      const openingEntry = textValue(input, "pos_opening_entry") || getCartIdentity().openingEntry;
      const resultPayments = Array.isArray(result.payments) ? result.payments : [];
      const inputPayments = Array.isArray(input.payments) ? input.payments : [];
      const paymentMode = textValue(asRecord(resultPayments[0]), "mode_of_payment") || textValue(asRecord(inputPayments[0]), "mode_of_payment");
      logRefund(returnInvoice, openingEntry, amount, paymentMode);
    }
    return result ? { result, error: null } : { result: null, error: "Refund response was empty." };
  } catch (error) {
    return { result: null, error: error instanceof Error ? error.message : "Refund submission failed." };
  }
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

// --- Delta-sync helpers ---------------------------------------------------
// Highest `modified` value across the given row groups — used as the next delta watermark
// (server-basis, so it is immune to client clock skew). Returns "" when there are no rows.
function maxModified(...rowGroups: Record<string, unknown>[][]): string {
  let max = "";
  for (const rows of rowGroups) for (const row of rows) { const m = textValue(row, "modified"); if (m > max) max = m; }
  return max;
}
// A full sync is due when its last-full timestamp is missing or older than 24h.
function isFullDue(lastFullKey: string): boolean {
  const last = getMeta(lastFullKey);
  if (!last) return true;
  const t = new Date(last).getTime();
  return Number.isNaN(t) || (Date.now() - t) > 24 * 60 * 60 * 1000;
}

async function fetchItemBarcodePages(baseUrl: string, apiKey: string, apiSecret: string, sendProgress: (message: string) => void, modifiedAfter?: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let start = 0; ; start += 500) {
    const query = new URLSearchParams({ limit_start: String(start), limit_page_length: "500" });
    if (modifiedAfter) query.set("modified_after", modifiedAfter);
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

// UOM conversions via custom method (the POS user can't read the UOM Conversion Detail child doctype
// over /api/resource). Supports delta via modified_after, paginated by next_start/has_more.
async function fetchUomConversionPages(baseUrl: string, apiKey: string, apiSecret: string, modifiedAfter?: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let start = 0;
  for (;;) {
    const query = new URLSearchParams({ limit_start: String(start), limit_page_length: "500" });
    if (modifiedAfter) query.set("modified_after", modifiedAfter);
    const response = await fetch(`${baseUrl}/api/method/aimatic.offline_pos.api.get_uom_conversions?${query.toString()}`, {
      headers: { Authorization: `token ${apiKey}:${apiSecret}` }
    });
    if (!response.ok) throw new Error(await getResponseError(response));
    const body = await response.json() as { message?: { rows?: unknown; has_more?: unknown; next_start?: unknown } };
    const page = Array.isArray(body.message?.rows) ? body.message.rows.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row)) : [];
    rows.push(...page);
    if (!body.message?.has_more) return rows;
    start = typeof body.message?.next_start === "number" ? body.message.next_start : start + 500;
  }
}

async function syncCustomers(mode: "auto" | "full" = "auto"): Promise<{ success: boolean; state: ReturnType<typeof getCustomerSyncState>; error: string | null }> {
  const settings=loadSettings(); if(!settings.erpnextUrl||!settings.apiKey||!settings.apiSecret) return {success:false,state:getCustomerSyncState(),error:"ERPNext URL and API credentials are required."};
  try {
    const base=new URL(settings.erpnextUrl).toString().replace(/\/+$/,"");
    const cursor=getMeta("customers_last_sync")??"";
    const doFull=mode==="full"||!cursor||isFullDue("customers_last_full_sync");
    const filters=doFull?[["disabled","=",0]]:[["disabled","=",0],["modified",">",cursor]];
    const customers=await fetchPagedList(base,settings.apiKey,settings.apiSecret,"Customer",["name","customer_name","customer_group","territory","mobile_no","email_id","tax_id","disabled","modified"],filters);
    upsertCustomers(customers);
    const wm=maxModified(customers); if(wm)setMeta("customers_last_sync",wm);
    if(doFull)setMeta("customers_last_full_sync",new Date().toISOString());
    return {success:true,state:getCustomerSyncState(),error:null};
  } catch(error) { return {success:false,state:getCustomerSyncState(),error:error instanceof Error?error.message:"Customer sync failed."}; }
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
    if (input.gift_voucher_code) payload.gift_voucher_code = String(input.gift_voucher_code);
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

// mode "full" = manual refresh / first run / 24h cadence → DELETE+INSERT for barcodes & conversions.
// mode "auto" with an existing watermark → delta: fetch only `modified > watermark` rows and UPSERT.
async function syncItemCatalog(sendProgress: (message: string) => void, mode: "auto" | "full" = "auto"): Promise<{ success: boolean; totals: ReturnType<typeof getCatalogTotals>; barcodeError: string | null; error: string | null }> {
  const settings = loadSettings();
  const bootstrap = getPosBootstrap(settings.posProfile);
  const profile = asRecord(bootstrap?.pos_profile);
  const priceList = textValue(profile, "selling_price_list");
  const warehouse = textValue(profile, "warehouse");
  const currency = textValue(profile, "currency");
  if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !priceList || !warehouse || !currency) {
    return { success: false, totals: getCatalogTotals(), barcodeError: null, error: "Cached POS Profile configuration is required." };
  }
  const itemsCursor = getMeta("items_last_sync") ?? "";
  const barcodesCursor = getMeta("barcodes_last_sync") ?? "";
  const doFull = mode === "full" || !itemsCursor || isFullDue("items_last_full_sync");
  const since = (base: unknown[]): unknown[] => doFull ? base : [...base, ["modified", ">", itemsCursor]];
  try {
    const baseUrl = new URL(settings.erpnextUrl).toString().replace(/\/+$/, "");
    sendProgress(doFull ? "Full sync: items..." : "Delta sync: items...");
    const items = await fetchPagedList(baseUrl, settings.apiKey, settings.apiSecret, "Item", ["name", "item_name", "item_group", "stock_uom", "is_stock_item", "is_sales_item", "disabled", "has_batch_no", "has_serial_no", "modified"], doFull ? undefined : [["modified", ">", itemsCursor]]);
    sendProgress(`Items: ${items.length}. Syncing prices...`);
    const prices = await fetchPagedList(baseUrl, settings.apiKey, settings.apiSecret, "Item Price", ["name", "item_code", "uom", "price_list_rate", "currency", "valid_from", "valid_upto", "modified"], since([["price_list", "=", priceList], ["selling", "=", 1]]));
    sendProgress(`Prices: ${prices.length}. Syncing stock...`);
    const stock = await fetchPagedList(baseUrl, settings.apiKey, settings.apiSecret, "Bin", ["item_code", "warehouse", "actual_qty", "reserved_qty", "projected_qty", "modified"], since([["warehouse", "=", warehouse]]));
    let conversions: Record<string, unknown>[] = [];
    let conversionError: string | null = null;
    try {
      sendProgress("Syncing UOM conversions...");
      conversions = await fetchUomConversionPages(baseUrl, settings.apiKey, settings.apiSecret, doFull ? undefined : (itemsCursor || undefined));
    } catch (error) {
      conversionError = error instanceof Error ? error.message : "Unable to sync UOM conversions.";
    }
    let barcodes: Record<string, unknown>[] = [];
    let barcodeError: string | null = null;
    try {
      sendProgress("Syncing barcodes...");
      barcodes = await fetchItemBarcodePages(baseUrl, settings.apiKey, settings.apiSecret, sendProgress, doFull ? undefined : (barcodesCursor || undefined));
    } catch (error) {
      barcodeError = error instanceof Error ? error.message : "Unable to sync Item Barcode.";
    }
    const totals = { items: items.length, prices: prices.length, barcodes: barcodes.length, stockRows: stock.length, lastSynced: new Date().toISOString() };
    // Full → DELETE+INSERT (replace) for barcodes/conversions; delta → UPSERT only (no destructive replace).
    upsertCatalog({ items, prices, stock, barcodes, conversions, totals, replaceBarcodes: doFull && !barcodeError, replaceConversions: doFull && !conversionError });
    // Advance watermarks from the server-provided max(modified) — never regress on an empty delta or a failed fetch.
    const itemsWatermark = maxModified(items, prices, stock, conversionError ? [] : conversions);
    if (itemsWatermark) setMeta("items_last_sync", itemsWatermark);
    if (!barcodeError) { const bw = maxModified(barcodes); if (bw) setMeta("barcodes_last_sync", bw); }
    if (doFull) setMeta("items_last_full_sync", new Date().toISOString());
    sendProgress("Catalog sync complete.");
    return { success: true, totals: getCatalogTotals(), barcodeError: [barcodeError, conversionError].filter(Boolean).join(" | ") || null, error: null };
  } catch (error) {
    return { success: false, totals: getCatalogTotals(), barcodeError: null, error: error instanceof Error ? error.message : "Catalog sync failed." };
  }
}

async function syncFbrConfig(mode: "auto" | "full" = "auto"):Promise<{success:boolean;state:ReturnType<typeof getFbrSyncState>;error:string|null}>{const s=loadSettings();if(!s.erpnextUrl||!s.apiKey||!s.apiSecret)return{success:false,state:getFbrSyncState(),error:"Online connection required for FBR configuration sync."};try{const base=new URL(s.erpnextUrl).toString().replace(/\/+$/,"");const cursor=getMeta("fbr_config_last_sync")??"";const doFull=mode==="full"||!cursor||isFullDue("fbr_config_last_full_sync");let start=0;let fee=0;const rows:Record<string,unknown>[]=[];for(;;){const q=new URLSearchParams({limit_start:String(start),limit_page_length:"500"});if(!doFull&&cursor)q.set("modified_after",cursor);const r=await fetch(`${base}/api/method/aimatic.offline_pos.api.get_pos_fbr_item_config?${q}`,{headers:{Authorization:`token ${s.apiKey}:${s.apiSecret}`}});if(!r.ok)throw new Error(await getResponseError(r));const b=await r.json() as {message?:unknown};const m=asRecord(b.message);const page=Array.isArray(m?.rows)?m.rows.map(asRecord).filter((x):x is Record<string,unknown>=>x!==null&&typeof x.item_code==="string"):[];rows.push(...page);if(typeof m?.service_fee==="number")fee=m.service_fee;if(!m?.has_more)break;start=typeof m?.next_start==="number"?m.next_start:start+500;}upsertFbrItemConfig(rows,fee);const wm=maxModified(rows);if(wm)setMeta("fbr_config_last_sync",wm);if(doFull)setMeta("fbr_config_last_full_sync",new Date().toISOString());return{success:true,state:getFbrSyncState(),error:null};}catch(e){return{success:false,state:getFbrSyncState(),error:e instanceof Error?e.message:"FBR configuration sync failed."};}}

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
    const query = new URLSearchParams({ customer: customerName, pos_profile: settings.posProfile });
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

async function listCustomerGiftVouchers(customerName: string): Promise<{ vouchers: Record<string, unknown>[]; error: string | null }> {
  const settings = loadSettings();
  if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !customerName) {
    return { vouchers: [], error: "Online connection required to load gift vouchers." };
  }
  try {
    const baseUrl = new URL(settings.erpnextUrl.trim()).toString().replace(/\/+$/, "");
    const company = textValue(asRecord(getPosBootstrap(settings.posProfile)?.pos_profile), "company");
    const query = new URLSearchParams({ customer: customerName });
    if (company) query.set("company", company);
    const response = await fetch(`${baseUrl}/api/method/aimatic.gift_voucher.api.list_customer_gift_vouchers?${query.toString()}`, {
      headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}` }
    });
    if (!response.ok) return { vouchers: [], error: await getResponseError(response) };
    const body = await response.json() as Record<string, unknown>;
    const payload = unwrapFrappePayload(body);
    const raw = Array.isArray(payload.vouchers) ? payload.vouchers : Array.isArray(payload) ? payload : Array.isArray(body.message) ? body.message : [];
    const vouchers = raw.map(asRecord).filter((x): x is Record<string, unknown> => Boolean(x));
    return { vouchers, error: null };
  } catch (error) {
    return { vouchers: [], error: error instanceof Error ? error.message : "Unable to load gift vouchers." };
  }
}

async function validateGiftVoucherCode(voucherCode: string, customerName: string): Promise<{ voucher: Record<string, unknown> | null; error: string | null }> {
  const settings = loadSettings();
  const code = voucherCode.trim();
  if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !code || !customerName) {
    return { voucher: null, error: "Online connection required to validate gift voucher." };
  }
  try {
    const baseUrl = new URL(settings.erpnextUrl.trim()).toString().replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/api/method/aimatic.gift_voucher.api.validate_gift_voucher_code`, {
      method: "POST",
      headers: { Authorization: `token ${settings.apiKey}:${settings.apiSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ voucher_code: code, customer: customerName })
    });
    if (!response.ok) return { voucher: null, error: await getResponseError(response) };
    const body = await response.json() as Record<string, unknown>;
    const payload = unwrapFrappePayload(body);
    return { voucher: payload, error: null };
  } catch (error) {
    return { voucher: null, error: error instanceof Error ? error.message : "Invalid gift voucher code." };
  }
}

type FbrCalculatedRow = { success: true; item_code: string; quantity: number; inclusiveAmount: number; taxRate: number; salesTax: number; valueExcludingTax: number; retailPrice: number; isThirdSchedule: boolean } | { success: false; item_code: string; error: string };
function isSuccessfulFbrRow(row: FbrCalculatedRow): row is Extract<FbrCalculatedRow, { success: true }> { return row.success === true; }
function calculateFbrCart(input:Record<string,unknown>):Record<string,unknown>{const items=Array.isArray(input.items)?input.items.map(asRecord).filter((x):x is Record<string,unknown>=>x!==null):[];const configs=getFbrItemConfigs(items.map(x=>String(x.item_code??"")));const state=getFbrSyncState();const rows:FbrCalculatedRow[]=items.map(item=>{const code=String(item.item_code??"");const c=configs[code];if(!c)return{success:false,item_code:code,error:`FBR Tax Category is missing for ${code}`};if(c.enabled===0)return{success:false,item_code:code,error:`FBR Tax Category is disabled for ${code}`};try{const result=calculateFbrItem({itemCode:code,qty:Number(item.qty)||0,rate:Number(item.rate)||0,amount:Number(item.amount)||undefined,taxRate:Number(c.tax_rate)||0,isExempt:Boolean(c.is_exempt),isZeroRated:Boolean(c.is_zero_rated),isThirdSchedule:Boolean(c.is_third_schedule||c.custom_is_3rd_schedule),mrp:Number(c.custom_mrp)?Number(c.custom_mrp)*(Number(item.conversion_factor)||1):undefined,taxCategory:String(c.custom_fbr_tax_category||""),hsCode:String(c.custom_fbr_hs_code||"")});return{success:true,item_code:code,quantity:result.quantity,inclusiveAmount:result.inclusiveAmount,taxRate:result.taxRate,salesTax:result.salesTax,valueExcludingTax:result.valueExcludingTax,retailPrice:result.retailPrice,isThirdSchedule:result.isThirdSchedule};}catch(e){return{success:false,item_code:code,error:e instanceof Error?e.message:"FBR calculation failed"};}});const validRows=rows.filter(isSuccessfulFbrRow);const valid=validRows.map(r=>({itemCode:r.item_code,qty:r.quantity,rate:Number((items.find(i=>String(i.item_code)===r.item_code)?.rate)||0),amount:r.inclusiveAmount,taxRate:r.taxRate,isThirdSchedule:r.isThirdSchedule,mrp:r.retailPrice/(r.quantity||1)}));const totals=calculateFbrInvoice(valid,state.serviceFee);const errorRows=rows.filter((row):row is Extract<FbrCalculatedRow,{success:false}>=>row.success===false);return{success:true,rows,totals,errors:errorRows.map(row=>row.error)};}

// --- Auto-update (electron-updater + GitHub Releases) ---------------------
let autoUpdaterReady = false;
function sendUpdateStatus(state: string, payload: Record<string, unknown> = {}): void {
  mainWindowRef?.webContents.send("update:status", { state, ...payload });
}
// Apply a GitHub token for PRIVATE-repo updates when one is saved; public repos need none.
function applyUpdateFeed(): void {
  const token = (getMeta("github_update_token") || "").trim();
  if (token) {
    autoUpdater.setFeedURL({ provider: "github", owner: "BeelBegins", repo: "Posapplication", private: true, token } as Parameters<typeof autoUpdater.setFeedURL>[0]);
  }
}
function setupAutoUpdater(): void {
  if (autoUpdaterReady) { applyUpdateFeed(); return; }
  autoUpdaterReady = true;
  autoUpdater.autoDownload = false;            // the in-app button controls download
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;
  applyUpdateFeed();
  autoUpdater.on("checking-for-update", () => sendUpdateStatus("checking"));
  autoUpdater.on("update-available", (info) => sendUpdateStatus("available", { version: info.version, notes: typeof info.releaseNotes === "string" ? info.releaseNotes : "" }));
  autoUpdater.on("update-not-available", (info) => sendUpdateStatus("not-available", { version: info.version }));
  autoUpdater.on("error", (err) => sendUpdateStatus("error", { error: err == null ? "unknown" : String(err.message || err) }));
  autoUpdater.on("download-progress", (p) => sendUpdateStatus("downloading", { percent: Math.round(p.percent), transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond }));
  autoUpdater.on("update-downloaded", (info) => sendUpdateStatus("downloaded", { version: info.version }));
}

// --- Release browser (pick any version) -----------------------------------
const RELEASES_API = "https://api.github.com/repos/BeelBegins/Posapplication/releases";
interface ReleaseEntry { tag: string; version: string; name: string; notes: string; publishedAt: string; prerelease: boolean; exeName: string; exeUrl: string; exeApiUrl: string; }
function ghHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = (getMeta("github_update_token") || "").trim();
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "erpnext-offline-pos", ...extra };
  if (token) headers.Authorization = `token ${token}`;
  return headers;
}
async function listReleases(): Promise<{ releases: ReleaseEntry[]; error: string | null }> {
  try {
    const response = await fetch(`${RELEASES_API}?per_page=30`, { headers: ghHeaders() });
    if (!response.ok) return { releases: [], error: await getResponseError(response) };
    const body = await response.json() as unknown[];
    const releases: ReleaseEntry[] = [];
    for (const raw of Array.isArray(body) ? body : []) {
      const r = asRecord(raw); if (!r) continue;
      const assets = Array.isArray(r.assets) ? r.assets.map(asRecord).filter((a): a is Record<string, unknown> => Boolean(a)) : [];
      const exe = assets.find((a) => textValue(a, "name").toLowerCase().endsWith(".exe"));
      if (!exe) continue; // only releases that actually carry a Windows installer
      releases.push({
        tag: textValue(r, "tag_name"), version: textValue(r, "tag_name").replace(/^v/i, ""),
        name: textValue(r, "name") || textValue(r, "tag_name"), notes: textValue(r, "body"),
        publishedAt: textValue(r, "published_at") || textValue(r, "created_at"), prerelease: Boolean(r.prerelease),
        exeName: textValue(exe, "name"), exeUrl: textValue(exe, "browser_download_url"), exeApiUrl: textValue(exe, "url")
      });
    }
    return { releases, error: null };
  } catch (e) { return { releases: [], error: e instanceof Error ? e.message : "Unable to list releases." }; }
}
// Download a chosen release's installer and launch it (works for any version, incl. rollback).
async function installRelease(input: Record<string, unknown>): Promise<{ ok: boolean; error: string | null }> {
  const exeName = textValue(input, "exeName") || `pos-setup-${Date.now()}.exe`;
  const token = (getMeta("github_update_token") || "").trim();
  const url = token ? textValue(input, "exeApiUrl") : textValue(input, "exeUrl"); // private repos must use the asset API URL + token
  if (!url) return { ok: false, error: "No installer URL for the selected release." };
  try {
    sendUpdateStatus("downloading", { percent: 0, version: textValue(input, "version") });
    const response = await fetch(url, { headers: token ? ghHeaders({ Accept: "application/octet-stream" }) : { "User-Agent": "erpnext-offline-pos" } });
    if (!response.ok) return { ok: false, error: await getResponseError(response) };
    const buffer = Buffer.from(await response.arrayBuffer());
    const target = path.join(app.getPath("temp"), exeName.replace(/[^\w.\- ]/g, "_"));
    await writeFile(target, buffer);
    sendUpdateStatus("downloaded", { version: textValue(input, "version"), manual: true });
    const child = spawn(target, [], { detached: true, stdio: "ignore" });
    child.unref();
    setTimeout(() => app.exit(0), 800);           // step aside so the installer can replace and relaunch the app
    return { ok: true, error: null };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Unable to download the selected release." }; }
}

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: "Aimatic POS App",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindowRef = mainWindow;

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", () => {
    if (mainWindowRef === mainWindow) mainWindowRef = null;
  });
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
  ipcMain.handle("window:focus-pos", () => {
    const win = mainWindowRef;
    if (!win || win.isDestroyed()) return false;
    win.focus();
    win.webContents.focus();
    win.webContents.send("pos:focus-scanner");
    return true;
  });
  ipcMain.handle("server:test", () => testServerReachability());
  ipcMain.handle("auth:test", () => testApiAuthentication());
  ipcMain.handle("cashier:login", (_event, input) => posCashierLogin(asRecord(input) ?? {}));
  ipcMain.handle("cashier:offline-login", (_event, input) => cashierOfflineLogin(asRecord(input) ?? {}));
  ipcMain.handle("cashier:remembered", () => rememberedCashiers());
  ipcMain.handle("pos-profiles:list", () => loadAvailablePosProfiles());
  ipcMain.handle("pos-profile:load", () => loadPosProfile());
  ipcMain.handle("pos-profile-cache:get-status", () => getPosProfileCacheStatus());
  ipcMain.handle("pos-configuration:sync", () => syncPosConfiguration());
  ipcMain.handle("pos-configuration:get-cached", () => getCachedPosConfiguration());
  ipcMain.handle("pos-session:sync", (_event, input) => syncPosSession(asRecord(input) ?? {}));
  ipcMain.handle("pos-session:get-cached", () => getCachedSessionSummary());
  ipcMain.handle("pos-session:active", (_event, input) => getActivePosSession(asRecord(input) ?? {}));
  ipcMain.handle("pos-session:start", (_event,input) => startPosSession(asRecord(input)??{}));
  ipcMain.handle("catalog:sync", (event, mode) => syncItemCatalog((message) => event.sender.send("catalog:progress", message), mode === "full" ? "full" : "auto"));
  ipcMain.handle("catalog:get-totals", () => getCatalogTotals());
  ipcMain.handle("fbr:sync", (_event, mode) => syncFbrConfig(mode === "full" ? "full" : "auto"));
  ipcMain.handle("fbr:state", () => getFbrSyncState());
  ipcMain.handle("catalog:search", (_event, query) => searchCatalog(String(query), textValue(asRecord(getPosBootstrap(loadSettings().posProfile)?.pos_profile), "warehouse")));
  ipcMain.handle("catalog:lookup", (_event, query) => lookupCatalog(String(query), textValue(asRecord(getPosBootstrap(loadSettings().posProfile)?.pos_profile), "warehouse")));
  ipcMain.handle("cart:load", () => { const id = getCartIdentity(); return loadCartState(id.terminalId, id.openingEntry); });
  ipcMain.handle("cart:save", (_event, lines) => { const id = getCartIdentity(); saveCartState(id.terminalId, id.openingEntry, Array.isArray(lines) ? lines : []); });
  ipcMain.handle("payments:methods", () => getPaymentMethods());
  ipcMain.handle("payments:load", () => { const id=getCartIdentity(); const cartKey=`${id.terminalId}::${id.openingEntry}`; return loadPaymentDraft(cartKey); });
  ipcMain.handle("payments:save", (_event, payments) => { const id=getCartIdentity(); savePaymentDraft(`${id.terminalId}::${id.openingEntry}`,Array.isArray(payments)?payments:[]); });
  ipcMain.handle("customers:sync", (_event, mode) => syncCustomers(mode === "full" ? "full" : "auto"));
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
  ipcMain.handle("benefits:gift-vouchers", (_event, customerName) => listCustomerGiftVouchers(String(customerName)));
  ipcMain.handle("benefits:validate-gift-voucher", (_event, voucherCode, customerName) => validateGiftVoucherCode(String(voucherCode), String(customerName)));
  ipcMain.handle("sale:terminal-id", () => getTerminalInvoiceId());
  ipcMain.handle("sale:submit", (_event,input) => submitOnlineSale(asRecord(input)??{}));
  ipcMain.handle("sale:queue", (_event,input) => queueSale(asRecord(input)??{}));
  ipcMain.handle("queue:sync", () => syncSaleQueue());
  ipcMain.handle("queue:status", () => getQueueCounts());
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
  ipcMain.handle("refund:get-invoice", (_event, invoiceName) => getInvoiceForRefund(String(invoiceName)));
  ipcMain.handle("refund:submit", (_event, input) => submitPosRefund(asRecord(input) ?? {}));
  ipcMain.handle("shift:summary", (_event, input) => getShiftSummary(asRecord(input) ?? (typeof input === "string" ? input : {})));
  ipcMain.handle("shift:close", (_event, input) => closeShift(asRecord(input) ?? {}));
  ipcMain.handle("shift:history", () => getShiftHistoryList());
  ipcMain.handle("shift:history-get", (_event, openingEntry) => getShiftHistory(String(openingEntry ?? "")));
  ipcMain.handle("update:current-version", () => app.getVersion());
  ipcMain.handle("update:check", async () => {
    try { setupAutoUpdater(); await autoUpdater.checkForUpdates(); return { ok: true, error: null }; }
    catch (e) { const msg = e instanceof Error ? e.message : "Update check failed"; sendUpdateStatus("error", { error: msg }); return { ok: false, error: msg }; }
  });
  ipcMain.handle("update:download", async () => {
    try { await autoUpdater.downloadUpdate(); return { ok: true, error: null }; }
    catch (e) { const msg = e instanceof Error ? e.message : "Download failed"; sendUpdateStatus("error", { error: msg }); return { ok: false, error: msg }; }
  });
  ipcMain.handle("update:install", () => {
    sendUpdateStatus("installing");
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
  ipcMain.handle("update:save-token", (_event, token) => { setMeta("github_update_token", String(token ?? "").trim()); applyUpdateFeed(); return { ok: true }; });
  ipcMain.handle("update:token-set", () => Boolean((getMeta("github_update_token") || "").trim()));
  ipcMain.handle("releases:list", () => listReleases());
  ipcMain.handle("releases:install", (_event, input) => installRelease(asRecord(input) ?? {}));
  ipcMain.handle("admin:pin-status", (_event, input) => adminStatus(input));
  ipcMain.handle("admin:pin-verify", (_event, input) => verifyAdminPin(asRecord(input) ?? {}));
  ipcMain.handle("admin:authorize-action", (_event, input) => authorizePosAdminAction(asRecord(input) ?? {}));
  ipcMain.handle("admin:pin-set", (_event, input) => setAdminPin(asRecord(input) ?? {}));
  createMainWindow();
  setupAutoUpdater();

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
