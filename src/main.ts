import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import {
  getCatalogTotals,
  getFbrSyncState,
  getCustomerSyncState,
  loadCartState,
  loadPaymentDraft,
  loadBenefitsDraft,
  saveBenefitsDraft,
  getDatabaseStatus,
  getPosBootstrap,
  getPosProfileCacheStatus,
  getSettingsForRenderer,
  searchCatalog,
  lookupCatalog,
  searchCustomers,
  initDatabase,
  loadSettings,
  saveSettings
  ,saveCartState
  ,savePaymentDraft
  ,saveSaleHistory
  ,holdSale
  ,listHeldSales
  ,getHeldSale
  ,deleteHeldSale
  ,renameHeldSale
  ,listSalesHistory
  ,getSaleHistory
  ,recordReprint
  ,setSaleHistoryStatus
  ,getShiftHistory
  ,getQueuedSales
  ,getQueueCounts
  ,cacheReceiptHtml
  ,getCachedReceiptHtml
  ,getMeta
  ,setMeta
  ,normalizeErpnextUrl
  ,logRefund
} from "./db/database";
import type { HeldSaleInput, SalesHistoryFilter, ShiftHistoryRow } from "./db/database";
import type { CashierLoginResult, ReleaseEntry } from "./core/types";
import * as database from "./db/database";
import { createPosCore, asRecord, textValue, sameIdentity, unwrapFrappePayload, formatResponseError, getResponseError } from "./core";

let mainWindowRef: BrowserWindow | null = null;
const core = createPosCore({ db: database, fetch });

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

function buildSalePayload(input: Record<string, unknown>): Record<string, unknown> {
  const settings = loadSettings();
  const id = String(input.terminal_invoice_id || core.getTerminalInvoiceId());
  const identity = core.getCartIdentity();
  const requestedOpening = String(input.opening_entry || identity.openingEntry || "");
  const offlineAuthenticated = Boolean(input.offline_authenticated);
  const openingEntry = offlineAuthenticated ? "" : core.realOpeningEntry(requestedOpening);
  let localOfflineSessionId = String(input.local_offline_session_id || "").trim();
  if (!localOfflineSessionId && core.isOfflineBatchId(requestedOpening)) localOfflineSessionId = requestedOpening.trim();
  if (!localOfflineSessionId && offlineAuthenticated) localOfflineSessionId = identity.offlineBatchId || core.getOfflineBatchId(identity.terminalId);
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
  return { provisional: true, offline: true, queued: true, terminal_invoice_id: id, pos_invoice: id, posting_datetime: new Date().toISOString(), fbr_status: "Awaiting internet availability", fbr_invoice_number: "Pending", fbr_response: "Will submit automatically when ERPNext is online", estimated_total: core.numValue(payload, "estimated_total") };
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
  const batch = textValue(payload, "local_offline_session_id") || (core.isOfflineBatchId(current) ? current : "");
  if (current && !core.isOfflineBatchId(current)) return { openingEntry: current, error: null };
  if (!batch) return { openingEntry: null, error: "Queued sale is missing local_offline_session_id and real POS Opening Entry." };
  const cashierUser = textValue(payload, "cashier_user");
  if (!cashierUser) return { openingEntry: null, error: "Queued sale is missing cashier_user." };
  const cacheKey = `${batch}|${cashierUser}`;
  if (cache.has(cacheKey)) return { openingEntry: cache.get(cacheKey) || null, error: null };
  const result = await core.startPosSession({ opening_balances: [], cashier_user: cashierUser, local_offline_session_id: batch });
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
  const auth = await core.testApiAuthentication();
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
      if (core.isOfflineBatchId(opening.openingEntry)) { failed += 1; error = "Offline batch ID could not be converted to a real POS Opening Entry."; break; }
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
      const amount = Math.abs(core.numValue(invoice, "grand_total") || core.numValue(invoice, "rounded_total") || core.numValue(result, "grand_total") || core.numValue(result, "refund_total") || 0);
      const openingEntry = textValue(input, "pos_opening_entry") || core.getCartIdentity().openingEntry;
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
  ipcMain.handle("server:test", () => core.testServerReachability());
  ipcMain.handle("auth:test", () => core.testApiAuthentication());
  ipcMain.handle("cashier:login", (_event, input) => posCashierLogin(asRecord(input) ?? {}));
  ipcMain.handle("cashier:offline-login", (_event, input) => cashierOfflineLogin(asRecord(input) ?? {}));
  ipcMain.handle("cashier:remembered", () => rememberedCashiers());
  ipcMain.handle("pos-profiles:list", () => core.loadAvailablePosProfiles());
  ipcMain.handle("pos-profile:load", () => core.loadPosProfile());
  ipcMain.handle("pos-profile-cache:get-status", () => getPosProfileCacheStatus());
  ipcMain.handle("pos-configuration:sync", () => core.syncPosConfiguration());
  ipcMain.handle("pos-configuration:get-cached", () => core.getCachedPosConfiguration());
  ipcMain.handle("pos-session:sync", (_event, input) => core.syncPosSession(asRecord(input) ?? {}));
  ipcMain.handle("pos-session:get-cached", () => core.getCachedSessionSummary());
  ipcMain.handle("pos-session:active", (_event, input) => core.getActivePosSession(asRecord(input) ?? {}));
  ipcMain.handle("pos-session:start", (_event,input) => core.startPosSession(asRecord(input)??{}));
  ipcMain.handle("catalog:sync", (event, mode) => core.syncItemCatalog((message) => event.sender.send("catalog:progress", message), mode === "full" ? "full" : "auto"));
  ipcMain.handle("catalog:get-totals", () => getCatalogTotals());
  ipcMain.handle("fbr:sync", (_event, mode) => core.syncFbrConfig(mode === "full" ? "full" : "auto"));
  ipcMain.handle("fbr:state", () => getFbrSyncState());
  ipcMain.handle("catalog:search", (_event, query) => searchCatalog(String(query), textValue(asRecord(getPosBootstrap(loadSettings().posProfile)?.pos_profile), "warehouse")));
  ipcMain.handle("catalog:lookup", (_event, query) => lookupCatalog(String(query), textValue(asRecord(getPosBootstrap(loadSettings().posProfile)?.pos_profile), "warehouse")));
  ipcMain.handle("cart:load", () => { const id = core.getCartIdentity(); return loadCartState(id.terminalId, id.openingEntry); });
  ipcMain.handle("cart:save", (_event, lines) => { const id = core.getCartIdentity(); saveCartState(id.terminalId, id.openingEntry, Array.isArray(lines) ? lines : []); });
  ipcMain.handle("payments:methods", () => core.getPaymentMethods());
  ipcMain.handle("payments:load", () => { const id=core.getCartIdentity(); const cartKey=`${id.terminalId}::${id.openingEntry}`; return loadPaymentDraft(cartKey); });
  ipcMain.handle("payments:save", (_event, payments) => { const id=core.getCartIdentity(); savePaymentDraft(`${id.terminalId}::${id.openingEntry}`,Array.isArray(payments)?payments:[]); });
  ipcMain.handle("customers:sync", (_event, mode) => core.syncCustomers(mode === "full" ? "full" : "auto"));
  ipcMain.handle("customers:state", () => getCustomerSyncState());
  ipcMain.handle("customers:search", (_event, query) => searchCustomers(String(query)));
  ipcMain.handle("customers:load", (_event, name) => core.loadCustomer(String(name)));
  ipcMain.handle("customers:options", () => core.getCustomerCreationOptions());
  ipcMain.handle("customers:create", (_event, input) => core.createCustomer(asRecord(input) ?? {}));
  ipcMain.handle("cart:preview", (_event, input) => core.previewCart(asRecord(input) ?? {}));
  ipcMain.handle("fbr:preview", (_event, input) => core.calculateFbrCart(asRecord(input) ?? {}));
  ipcMain.handle("benefits:load", () => { const id = core.getCartIdentity(); return loadBenefitsDraft(`${id.terminalId}::${id.openingEntry}`); });
  ipcMain.handle("benefits:save", (_event, benefits) => { const id = core.getCartIdentity(); const data = asRecord(benefits); if (data) saveBenefitsDraft(`${id.terminalId}::${id.openingEntry}`, data); });
  ipcMain.handle("benefits:customer", (_event, customerName) => core.getCustomerBenefits(String(customerName)));
  ipcMain.handle("benefits:validate-coupon", (_event, couponCode) => core.validateCoupon(String(couponCode)));
  ipcMain.handle("benefits:gift-vouchers", (_event, customerName) => core.listCustomerGiftVouchers(String(customerName)));
  ipcMain.handle("benefits:validate-gift-voucher", (_event, voucherCode, customerName) => core.validateGiftVoucherCode(String(voucherCode), String(customerName)));
  ipcMain.handle("sale:terminal-id", () => core.getTerminalInvoiceId());
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
  ipcMain.handle("shift:summary", (_event, input) => core.getShiftSummary(asRecord(input) ?? (typeof input === "string" ? input : {})));
  ipcMain.handle("shift:close", (_event, input) => core.closeShift(asRecord(input) ?? {}));
  ipcMain.handle("shift:history", () => core.getShiftHistoryList());
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
