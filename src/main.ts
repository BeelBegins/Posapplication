import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
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
  ,getQueueCounts
  ,getMeta
  ,setMeta
  ,normalizeErpnextUrl
  ,clearSiteScopedCache
  ,getOrCreateHardwareId
} from "./db/database";
import type { ShiftHistoryRow } from "./db/database";
import type { CashierLoginResult } from "./core/types";
import * as database from "./db/database";
import { createPosCore, asRecord, textValue, sameIdentity, unwrapFrappePayload, formatResponseError, getResponseError } from "./core";
import { createPlatformService } from "./platform/platform-service";

let mainWindowRef: BrowserWindow | null = null;
let customerDisplayWindow: BrowserWindow | null = null;
const core = createPosCore({ db: database, fetch });
const runtimeInfo = createPlatformService("electron", "pos");

// Second-monitor, customer-facing display. Greenfield: the app is single-window
// otherwise (the only other BrowserWindow is a hidden print-rendering one, not
// a persistent display). Skips creation entirely — not an error — when only
// one display is connected, since not every terminal has this hardware yet.
type CustomerDisplayResult = "opened-fullscreen" | "opened-windowed" | "focused" | "no-second-display";

// `forceWindowed` is only ever honored when there's genuinely no second monitor
// — it's the escape hatch for testing/previewing the display on a single-screen
// dev machine (see the "Preview Customer Display" Settings button). When a real
// second display exists it always wins and gets the real fullscreen treatment,
// so the preview affordance can never accidentally shadow the real hardware.
function createCustomerDisplayWindow(options: { forceWindowed?: boolean } = {}): CustomerDisplayResult {
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    customerDisplayWindow.focus();
    return "focused";
  }
  const primary = screen.getPrimaryDisplay();
  const secondary = screen.getAllDisplays().find((display) => display.id !== primary.id);
  if (!secondary && !options.forceWindowed) {
    console.log("Customer display: only one monitor detected, skipping second window.");
    return "no-second-display";
  }
  const windowed = !secondary;
  const target = secondary ?? primary;
  const win = new BrowserWindow({
    x: windowed ? undefined : target.bounds.x,
    y: windowed ? undefined : target.bounds.y,
    width: windowed ? 480 : target.bounds.width,
    height: windowed ? 800 : target.bounds.height,
    // Deliberately NOT setting `fullscreen` here (unlike the position/size
    // above) - setting it in the same constructor call as x/y/width/height
    // is an Electron/Windows footgun where the fullscreen transition can
    // resolve against whichever display the window materializes on first
    // (often the primary) instead of sticking to the just-set position, so
    // the window ends up sized/fit to the wrong monitor. Positioning first
    // and calling setFullScreen() as a separate step once the window
    // already exists at the right bounds (below) makes it reliably fullscreen
    // on the intended secondary display instead.
    show: false,
    frame: windowed,
    // A resizable frameless window keeps an invisible OS resize border on
    // Windows, whose bounds extend a few pixels past what's actually drawn -
    // that was making the real fullscreen display end up "a little bigger
    // than the screen". This display is never meant to be manually resized
    // anyway (kiosk-style, always sized to the target display's own bounds).
    resizable: false,
    autoHideMenuBar: true,
    title: `Aimatic POS App — Customer Display${windowed ? " (Preview)" : ""}`,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  customerDisplayWindow = win;
  win.loadFile(path.join(__dirname, "renderer", "customer-display.html"));
  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    if (!windowed) {
      win.setBounds(target.bounds);
      win.setFullScreen(true);
    }
    win.show();
  });
  win.on("closed", () => {
    if (customerDisplayWindow === win) customerDisplayWindow = null;
  });
  return windowed ? "opened-windowed" : "opened-fullscreen";
}

function missingCashierLoginEndpointMessage(): string {
  return "Cashier login requires server endpoint aimatic.offline_pos.api.pos_cashier_login";
}

// Terminal setup: exchange an ERPNext username+password for that user's api_key/api_secret,
// so first-run setup never requires copying keys out of Frappe's User settings. No apiKey/apiSecret
// is used or required for this call (unlike posCashierLogin) — the endpoint is allow_guest on the
// server, gated by the password check itself.
async function provisionTerminalCredentials(input: Record<string, unknown>): Promise<{ success: boolean; apiKey: string; apiSecret: string; error: string | null }> {
  const erpnextUrl = textValue(input, "erpnextUrl");
  const username = textValue(input, "username");
  const password = textValue(input, "password");
  const empty = { success: false, apiKey: "", apiSecret: "", error: null as string | null };
  if (!erpnextUrl || !username || !password) return { ...empty, error: "ERPNext URL, username, and password are required." };
  let base: URL;
  try { base = new URL(normalizeErpnextUrl(erpnextUrl)); } catch { return { ...empty, error: "ERPNext URL is invalid." }; }
  if (base.protocol !== "https:") return { ...empty, error: "HTTPS is required for terminal credential provisioning." };
  const endpoint = `${base.toString().replace(/\/+$/, "")}/api/method/aimatic.offline_pos.api.provision_terminal_credentials`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const rawBody = await response.text();
    let parsed: { message?: unknown } = {};
    try { parsed = JSON.parse(rawBody) as { message?: unknown }; } catch { /* non-JSON */ }
    const payload = asRecord(parsed.message) ?? {};
    if (!response.ok) return { ...empty, error: formatResponseError(response.status, response.statusText, rawBody) };
    const apiKey = textValue(payload, "api_key");
    const apiSecret = textValue(payload, "api_secret");
    if (!apiKey || !apiSecret) return { ...empty, error: "Server returned no credentials." };
    return { success: true, apiKey, apiSecret, error: null };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : "Unable to reach ERPNext server." };
  }
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
    return { ...empty, error: "This POS Profile has no Terminal ID assigned on the server yet. Sync POS Profile or contact your administrator." };
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
      canStartShift: Boolean(payload.can_start_shift ?? false),
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

// Cache keys are scoped by hardwareId (per-physical-machine), not the logical terminalId — since
// terminalId is now shared across every terminal assigned to the same POS Profile, keying these on
// it would let one machine's cached offline PIN / remembered-cashier list validate on another.
function cashierCacheKey(user: string): string {
  const settings = loadSettings();
  const identity = `${normalizeIdentityPart(getOrCreateHardwareId())}|${normalizeIdentityPart(settings.posProfile)}|${normalizeCashierUser(user)}`;
  return `cashier_offline_v1_${hashSecret(identity)}`;
}

function legacyCashierCacheKey(user: string): string {
  const settings = loadSettings();
  const identity = `${getOrCreateHardwareId()}|${settings.posProfile.trim()}|${normalizeCashierUser(user)}`;
  return `cashier_offline_v1_${hashSecret(identity)}`;
}

function getCashierCacheRaw(user: string): string | null {
  return getMeta(cashierCacheKey(user)) || getMeta(legacyCashierCacheKey(user));
}

function rememberedCashiersKey(): string {
  const settings = loadSettings();
  return `cashier_remembered_v1_${hashSecret(`${normalizeIdentityPart(getOrCreateHardwareId())}|${normalizeIdentityPart(settings.posProfile)}`)}`;
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
  if (!settings.posProfile || !cashier.user) return { ok: false, error: "POS Profile is required before saving offline cashier PIN." };
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
    hardwareId: getOrCreateHardwareId(),
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
  if (!settings.posProfile) return { ...empty, error: "POS Profile is required before offline cashier login." };

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
  if (normalizeIdentityPart(textValue(cached, "hardwareId")) !== normalizeIdentityPart(getOrCreateHardwareId()) || normalizeIdentityPart(textValue(cached, "posProfile")) !== normalizeIdentityPart(settings.posProfile) || !stored) {
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

const ADMIN_PIN_MIN_LENGTH = 4;
const ADMIN_PIN_MAX_ATTEMPTS = 5;
const ADMIN_PIN_LOCK_MS = 5 * 60_000;
const ADMIN_PIN_DELAY_MS = 900;
const ALLOW_HTTP_SUPERVISOR_AUTH = !app.isPackaged || process.env.POS_ALLOW_HTTP_SUPERVISOR_AUTH === "1";
const DEV_ADMIN_AUTH_BYPASS = !app.isPackaged || process.env.POS_DEV_ADMIN_AUTH_BYPASS === "1";
// "settings" access and shift start/close no longer go through a terminal-wide
// Admin PIN at all - Settings always requires a fresh username/password check
// via authorizePosAdminAction below (server-side role check, same endpoint
// used here), and shift start/close is gated on the already-logged-in
// cashier's own canStartShift/canCloseShift capability flags from login. The
// only PIN concept left is each cashier's own Offline PIN (for offline
// login), whose "forgot PIN" reset still needs supervisor authorization -
// that's the one remaining use of this action/token flow.
type AdminAction = "reset_pin" | "change_credentials";
let pendingAdminAuthorization: { tokenHash: string; action: AdminAction; terminalId: string; expiresAt: number; cashierUser?: string } | null = null;

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

async function authorizePosAdminAction(input: Record<string, unknown>): Promise<{ ok: boolean; token: string; error: string | null }> {
  const settings = loadSettings();
  const action = textValue(input, "action") as AdminAction;
  const username = textValue(input, "username");
  const password = textValue(input, "password");
  const cashierUser = action === "reset_pin" ? normalizeCashierUser(textValue(input, "cashierUser")) : "";
  if (!settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !settings.terminalId) return { ok: false, token: "", error: "Terminal settings are required before supervisor authorization." };
  if (!["reset_pin", "change_credentials"].includes(action)) return { ok: false, token: "", error: "Invalid admin action." };
  if (!username || !password) return { ok: false, token: "", error: "Supervisor username and password are required." };
  if (DEV_ADMIN_AUTH_BYPASS) {
    const token = randomUUID();
    pendingAdminAuthorization = { tokenHash: hashSecret(token), action, terminalId: settings.terminalId, expiresAt: Date.now() + 5 * 60_000, cashierUser: cashierUser || undefined };
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
    pendingAdminAuthorization = { tokenHash: hashSecret(token), action, terminalId: settings.terminalId, expiresAt: Date.now() + 5 * 60_000, cashierUser: cashierUser || undefined };
    return { ok: true, token, error: null };
  } catch (error) {
    return { ok: false, token: "", error: supervisorAuthNetworkError(error) };
  }
}

function consumeCashierPinResetAuthorization(token: string, cashierUser: string): { ok: boolean; error: string | null } {
  const pending = pendingAdminAuthorization;
  pendingAdminAuthorization = null;
  const terminalId = loadSettings().terminalId;
  if (!pending) return { ok: false, error: "Supervisor authorization is missing or expired." };
  if (pending.expiresAt < Date.now()) return { ok: false, error: "Supervisor authorization expired." };
  if (pending.action !== "reset_pin") return { ok: false, error: "Supervisor authorization was for a different action." };
  if (pending.terminalId !== terminalId) return { ok: false, error: "Supervisor authorization was for a different terminal." };
  if (pending.tokenHash !== hashSecret(token)) return { ok: false, error: "Supervisor authorization token is invalid." };
  if (!pending.cashierUser || pending.cashierUser !== cashierUser) return { ok: false, error: "Supervisor authorization was for a different cashier." };
  return { ok: true, error: null };
}

async function resetCashierOfflinePinWithAuthorization(input: Record<string, unknown>): Promise<{ ok: boolean; error: string | null }> {
  const cashierUser = normalizeCashierUser(textValue(input, "cashierUser"));
  const pin = textValue(input, "pin");
  const confirmPin = textValue(input, "confirmPin");
  const token = textValue(input, "token");
  if (!cashierUser) return { ok: false, error: "Cashier username is required." };
  const formatError = validatePinFormat(pin);
  if (formatError) return { ok: false, error: formatError };
  if (pin !== confirmPin) return { ok: false, error: "PIN confirmation does not match." };
  const consumed = consumeCashierPinResetAuthorization(token, cashierUser);
  if (!consumed.ok) return consumed;
  const raw = getCashierCacheRaw(cashierUser);
  if (!raw) return { ok: false, error: "No offline PIN is cached yet for this cashier on this terminal/profile - they must complete one online login with PIN setup first." };
  let cached: Record<string, unknown>;
  try { cached = JSON.parse(raw) as Record<string, unknown>; } catch { return { ok: false, error: "Cached cashier record is corrupted." }; }
  cached.pinHash = pinHash(pin);
  setMeta(cashierCacheKey(cashierUser), JSON.stringify(cached));
  setMeta(cashierFailedKey(cashierUser), "0");
  setMeta(cashierLockKey(cashierUser), "0");
  return { ok: true, error: null };
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
      // scaleFactor pinned to 100 so the OS print dialog never auto-shrinks
      // the 80mm-designed receipt layout to "fit printable area", which
      // alone wasn't enough to fix faded output. The bigger factor: with no
      // deviceName, this always popped a fresh native print dialog with
      // none of the printer's own saved driver defaults (darkness/media
      // type) that a regular browser printing the same server HTML would
      // already have dialed in for that printer. When a receipt printer is
      // configured in Settings, print straight to it silently instead,
      // using its own saved driver defaults every time.
      const receiptPrinter = database.loadSettings().receiptPrinter;
      const printOptions: Electron.WebContentsPrintOptions = receiptPrinter
        ? { silent: true, printBackground: true, scaleFactor: 100, deviceName: receiptPrinter }
        : { silent: false, printBackground: true, scaleFactor: 100 };
      printWindow.webContents.print(printOptions, (ok, failureReason) => {
        finish({ success: ok, error: ok ? null : (failureReason || "Printing was cancelled.") });
      });
    });
    printWindow.webContents.once("did-fail-load", (_event, _code, description) => finish({ success: false, error: description || "Receipt failed to load for printing." }));
    void printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
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

// Download a chosen release's installer and launch it (works for any version, incl. rollback).
async function installRelease(input: Record<string, unknown>): Promise<{ ok: boolean; error: string | null }> {
  const exeName = textValue(input, "exeName") || `pos-setup-${Date.now()}.exe`;
  const token = (getMeta("github_update_token") || "").trim();
  const url = token ? textValue(input, "exeApiUrl") : textValue(input, "exeUrl"); // private repos must use the asset API URL + token
  if (!url) return { ok: false, error: "No installer URL for the selected release." };
  try {
    sendUpdateStatus("downloading", { percent: 0, version: textValue(input, "version") });
    const response = await fetch(url, { headers: token ? core.ghHeaders({ Accept: "application/octet-stream" }) : { "User-Agent": "erpnext-offline-pos" } });
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
    // Frameless + no menu bar for a cashier-facing kiosk (no title bar to
    // show, no dev-tools/reload menu reachable). Deliberately NOT setting
    // `fullscreen` here alongside `frame`/`show` - doing all three atomically
    // at construction is the same race already fixed for the customer
    // display window below (setFullScreen resolving inconsistently), and on
    // this window it manifested as the native minimize/close caption
    // reappearing after leaving fullscreen via F11. Positioning/framing the
    // window first and switching to fullscreen as a separate step once it
    // already exists (in `ready-to-show` below) avoids that.
    frame: false,
    show: false,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindowRef = mainWindow;

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.setFullScreen(true);
    mainWindow.show();
  });
  mainWindow.on("closed", () => {
    if (mainWindowRef === mainWindow) mainWindowRef = null;
    // The app is meant to quit when its main window closes (see window-all-closed
    // below) — without this, a still-open customer display window would keep
    // window-all-closed from ever firing on Windows/Linux.
    if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) customerDisplayWindow.close();
  });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && (input.key === "F9" || input.code === "F9")) {
      event.preventDefault();
      mainWindow.webContents.send("pos:complete-sale-shortcut");
    }
    // Esc is already claimed by the POS screen itself ("Return to Scanner"),
    // so F11 is the escape hatch out of the fullscreen launched by default
    // above - toggles back and forth rather than only ever leaving fullscreen,
    // so a cashier/admin who steps out to the desktop can get back to a full,
    // untruncated view the same way.
    if (input.type === "keyDown" && (input.key === "F11" || input.code === "F11")) {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
    // Alt+F4 normally falls back to the OS's native "close window" system
    // command via the window's system menu - a frameless window has no such
    // menu, so that fallback isn't guaranteed, and without this the keydown
    // was instead reaching the renderer's own bare-F4 shortcut ("change
    // quantity"). Handle it explicitly here so Alt+F4 reliably closes the
    // app regardless.
    if (input.type === "keyDown" && input.alt && (input.key === "F4" || input.code === "F4")) {
      event.preventDefault();
      mainWindow.close();
    }
  });
}

app.whenReady().then(() => {
  initDatabase();
  console.log(`Hardware ID: ${getOrCreateHardwareId()}`);
  ipcMain.handle("db:getStatus", () => getDatabaseStatus());
  ipcMain.handle("app:runtime", () => runtimeInfo);
  ipcMain.handle("settings:save", (_event, settings) => {
    // Site-scoped local cache (catalog, POS Profile/bootstrap config, customers, cart,
    // held sales, ...) is keyed by name/profile, never by site — switching erpnextUrl/apiKey
    // without wiping it would let stale data from the old site keep bleeding into billing.
    const previous = loadSettings();
    const result = saveSettings(settings);
    const siteChanged = previous.erpnextUrl !== normalizeErpnextUrl(settings.erpnextUrl)
      || (Boolean(settings.apiKey) && previous.apiKey !== settings.apiKey);
    if (siteChanged) clearSiteScopedCache();
    return result;
  });
  ipcMain.handle("settings:load", () => getSettingsForRenderer());
  ipcMain.handle("settings:provisionCredentials", (_event, input) => provisionTerminalCredentials(asRecord(input) ?? {}));
  ipcMain.handle("printer:list", async () => {
    const win = mainWindowRef;
    if (!win || win.isDestroyed()) return [];
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name }));
  });
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
  ipcMain.handle("cart:load", () => { const id = core.getCartIdentity(); return loadCartState(id.hardwareId, id.openingEntry); });
  ipcMain.handle("cart:save", (_event, lines) => { const id = core.getCartIdentity(); saveCartState(id.hardwareId, id.openingEntry, Array.isArray(lines) ? lines : []); });
  ipcMain.on("customer-display:cart-update", (_event, payload) => {
    customerDisplayWindow?.webContents.send("customer-display:render", payload);
  });
  ipcMain.handle("customer-display:preview", () => createCustomerDisplayWindow({ forceWindowed: true }));
  ipcMain.handle("payments:methods", () => core.getPaymentMethods());
  ipcMain.handle("payments:load", () => { const id=core.getCartIdentity(); const cartKey=`${id.hardwareId}::${id.openingEntry}`; return loadPaymentDraft(cartKey); });
  ipcMain.handle("payments:save", (_event, payments) => { const id=core.getCartIdentity(); savePaymentDraft(`${id.hardwareId}::${id.openingEntry}`,Array.isArray(payments)?payments:[]); });
  ipcMain.handle("customers:sync", (_event, mode) => core.syncCustomers(mode === "full" ? "full" : "auto"));
  ipcMain.handle("customers:state", () => getCustomerSyncState());
  ipcMain.handle("customers:search", (_event, query) => searchCustomers(String(query)));
  ipcMain.handle("customers:load", (_event, name) => core.loadCustomer(String(name)));
  ipcMain.handle("customers:options", () => core.getCustomerCreationOptions());
  ipcMain.handle("customers:create", (_event, input) => core.createCustomer(asRecord(input) ?? {}));
  ipcMain.handle("cart:preview", (_event, input) => core.previewCart(asRecord(input) ?? {}));
  ipcMain.handle("fbr:preview", (_event, input) => core.calculateFbrCart(asRecord(input) ?? {}));
  ipcMain.handle("benefits:load", () => { const id = core.getCartIdentity(); return loadBenefitsDraft(`${id.hardwareId}::${id.openingEntry}`); });
  ipcMain.handle("benefits:save", (_event, benefits) => { const id = core.getCartIdentity(); const data = asRecord(benefits); if (data) saveBenefitsDraft(`${id.hardwareId}::${id.openingEntry}`, data); });
  ipcMain.handle("benefits:customer", (_event, customerName) => core.getCustomerBenefits(String(customerName)));
  ipcMain.handle("benefits:validate-coupon", (_event, couponCode) => core.validateCoupon(String(couponCode)));
  ipcMain.handle("benefits:gift-vouchers", (_event, customerName) => core.listCustomerGiftVouchers(String(customerName)));
  ipcMain.handle("benefits:validate-gift-voucher", (_event, voucherCode, customerName) => core.validateGiftVoucherCode(String(voucherCode), String(customerName)));
  ipcMain.handle("sale:terminal-id", () => core.getTerminalInvoiceId());
  ipcMain.handle("sale:submit", (_event,input) => core.submitOnlineSale(asRecord(input)??{}));
  ipcMain.handle("sale:queue", (_event,input) => core.queueSale(asRecord(input)??{}));
  ipcMain.handle("queue:sync", () => core.syncSaleQueue());
  ipcMain.handle("queue:status", () => getQueueCounts());
  ipcMain.handle("receipt:get", (_event,invoice) => core.getPosReceipt(String(invoice)));
  ipcMain.handle("receipt:get-duplicate", (_event, invoice) => core.getDuplicateReceipt(String(invoice)));
  ipcMain.handle("receipt:print", (_event, html) => printReceiptHtml(String(html ?? "")));
  ipcMain.handle("held:save", (_event, input) => holdSale(core.toHeldInput(asRecord(input) ?? {})));
  ipcMain.handle("held:list", () => listHeldSales());
  ipcMain.handle("held:get", (_event, id) => getHeldSale(Number(id)));
  ipcMain.handle("held:delete", (_event, id) => deleteHeldSale(Number(id)));
  ipcMain.handle("held:rename", (_event, id, name) => renameHeldSale(Number(id), String(name ?? "")));
  ipcMain.handle("history:list", (_event, filter) => listSalesHistory(core.toHistoryFilter(asRecord(filter) ?? {})));
  ipcMain.handle("history:get", (_event, id) => getSaleHistory(String(id)));
  ipcMain.handle("history:reprint", (_event, id) => recordReprint(String(id)));
  ipcMain.handle("sale:set-status", (_event, id, status) => setSaleHistoryStatus(String(id), String(status)));
  ipcMain.handle("refund:get-invoice", (_event, invoiceName) => core.getInvoiceForRefund(String(invoiceName)));
  ipcMain.handle("refund:submit", (_event, input) => core.submitPosRefund(asRecord(input) ?? {}));
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
  ipcMain.handle("releases:list", () => core.listReleases());
  ipcMain.handle("releases:install", (_event, input) => installRelease(asRecord(input) ?? {}));
  ipcMain.handle("admin:authorize-action", (_event, input) => authorizePosAdminAction(asRecord(input) ?? {}));
  ipcMain.handle("cashier:reset-pin-with-authorization", (_event, input) => resetCashierOfflinePinWithAuthorization(asRecord(input) ?? {}));
  createMainWindow();
  createCustomerDisplayWindow();
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
