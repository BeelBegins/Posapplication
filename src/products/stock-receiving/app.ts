import { LocalNotifications } from "@capacitor/local-notifications";
import { createApiClient } from "../../api/client";
import { createStockReceivingApi } from "../../api/stock-receiving";
import { scanItemBarcode } from "../../mobile/item-barcode-scanner";
import { capacitorOAuthBrowser } from "../../mobile/capacitor-oauth-browser";
import { OAuthPkceCredentialProvider, type OAuthPublicClientConfig } from "../../mobile/credential-provider";
import { androidSecureStorage } from "../../mobile/secure-storage";
import { escapeHtml as esc, icon } from "../shared/ui";

declare const __APP_VERSION__: string;
type Row = Record<string, any>;
const root = document.querySelector<HTMLElement>("#app")!;
const configKey = "aimatic-stock-receiving-config-v1";
const draftsKey = "aimatic-stock-receiving-drafts-v1";
const outboxKey = "aimatic-stock-receiving-outbox-v1";
let config: OAuthPublicClientConfig | null = null;
let credentials: OAuthPkceCredentialProvider | null = null;
let api: ReturnType<typeof createStockReceivingApi> | null = null;
let context: Row = {};
let pending: Row[] = [];
let current: Row | null = null;
let notice = "";
let noticeTone = "";
let busy = "";

function text(row: Row | undefined, ...keys: string[]): string { for (const key of keys) if (row?.[key] != null) return String(row[key]); return ""; }
function list(value: unknown): Row[] { return Array.isArray(value) ? value.filter((row): row is Row => Boolean(row) && typeof row === "object") : []; }
function jsonRead<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; } }
function saveRows(key: string, value: unknown): void { localStorage.setItem(key, JSON.stringify(value)); }
function keyFor(row: Row): string { return `${text(row, "source_type")}::${text(row, "name")}`; }
function draftMap(): Record<string, Row> { return jsonRead<Record<string, Row>>(draftsKey, {}); }
function outbox(): Row[] { return jsonRead<Row[]>(outboxKey, []); }
function noticeText(message: string, tone = ""): void { notice = message; noticeTone = tone; }
async function payload(response: Response): Promise<Row> {
  const raw = await response.json().catch(() => ({})) as Row;
  const value = raw.message && typeof raw.message === "object" ? raw.message : raw;
  if (!response.ok) throw new Error(text(value, "message", "exception") || `Server error ${response.status}`);
  return value;
}

async function configure(baseUrl: string): Promise<void> {
  const url = baseUrl.trim().replace(/\/+$/, "");
  const response = await fetch(`${url}/api/method/aimatic.stock_receiving.api.get_public_config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const publicConfig = await payload(response);
  config = { baseUrl: url, clientId: text(publicConfig, "oauth_client_id"), redirectUri: text(publicConfig, "redirect_uri"), scope: text(publicConfig, "scope") };
  if (!config.clientId || !config.redirectUri) throw new Error("Stock Receiving login is not configured on this server.");
  localStorage.setItem(configKey, JSON.stringify(config));
  credentials = new OAuthPkceCredentialProvider(async () => config!, androidSecureStorage, capacitorOAuthBrowser, fetch);
  api = createStockReceivingApi(createApiClient({ baseUrl: url, authentication: { mode: "user-session", credentials }, fetch }));
}

function setup(error = ""): void {
  root.innerHTML = `<section class="setup"><div class="setup-card"><div class="mark">SR</div><p class="eyebrow">Stock receiving</p><h1>Connect to ERP</h1><p>Enter your ERP server once. Then sign in with your normal ERP email and password.</p>${error ? `<div class="notice danger">${esc(error)}</div>` : ""}<form id="server-form"><label>Server link<input id="server-url" type="url" required placeholder="https://erp.example.com" autocomplete="url"></label><button class="primary wide">Continue</button></form><small>v${esc(__APP_VERSION__)} · No API key or secret</small></div></section>`;
  document.querySelector<HTMLFormElement>("#server-form")!.onsubmit = async (event) => { event.preventDefault(); const value = document.querySelector<HTMLInputElement>("#server-url")!.value; try { await configure(value); signIn(); } catch (error) { setup(error instanceof Error ? error.message : "Server connection failed."); } };
}

function signIn(error = ""): void {
  root.innerHTML = `<section class="setup"><div class="setup-card"><div class="mark">SR</div><p class="eyebrow">Stock receiving</p><h1>Sign in</h1><p>Use your ERP email and password. Your ERP branch permissions still apply.</p>${error ? `<div class="notice danger">${esc(error)}</div>` : ""}<button id="login" class="primary wide">Sign in with ERP</button><button id="change-server" class="secondary wide" style="margin-top:10px">Change server</button></div></section>`;
  document.querySelector<HTMLButtonElement>("#login")!.onclick = async () => { const button = document.querySelector<HTMLButtonElement>("#login")!; button.disabled = true; button.textContent = "Opening ERP login…"; try { await credentials!.login(); await loadContext(); } catch (error) { signIn(error instanceof Error ? error.message : "Sign in failed."); } };
  document.querySelector<HTMLButtonElement>("#change-server")!.onclick = () => { localStorage.removeItem(configKey); void credentials?.clear(); setup(); };
}

async function loadContext(): Promise<void> {
  busy = "Loading pending receiving"; renderQueue();
  try { context = await payload(await api!.getContext()); await syncOutbox(); await refreshPending(); }
  catch (error) { signIn(error instanceof Error ? error.message : "Unable to load receiving queue."); }
  finally { busy = ""; }
}

async function refreshPending(): Promise<void> {
  if (!navigator.onLine) { pending = []; renderQueue(); return; }
  const result = await payload(await api!.listPending());
  pending = list(result.documents);
  scheduleReminders(pending.length).catch(() => undefined);
  renderQueue();
}

async function scheduleReminders(count: number): Promise<void> {
  try {
    await LocalNotifications.requestPermissions();
    await LocalNotifications.cancel({ notifications: [1, 2, 3, 4, 5, 6].map((id) => ({ id })) });
    if (!count) return;
    const notifications = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, title: "Stock receiving pending", body: `${count} document${count === 1 ? " is" : "s are"} waiting for stock verification.`, schedule: { at: new Date(Date.now() + (index + 1) * 4 * 60 * 60 * 1000) } }));
    await LocalNotifications.schedule({ notifications });
  } catch { /* Notifications are helpful; the in-app queue remains authoritative. */ }
}

function queueView(): string {
  const rows = pending;
  return `<main><header class="top"><div class="identity"><span>${icon("truck", 22)}</span><div><strong>Stock Receiving</strong><small>${esc(text(context, "full_name"))}</small></div></div><span class="${navigator.onLine ? "online" : "offline"}">${navigator.onLine ? "Online" : "Offline"}</span></header><section class="page"><div class="title"><div><p class="eyebrow">${esc(text(context, "branches") || "Branch")}</p><h1>Pending receiving</h1><p>Check every item before confirming.</p></div><button id="refresh" class="secondary" ${busy ? "disabled" : ""}>${busy || "Refresh"}</button></div>${notice ? `<div class="notice ${noticeTone}">${esc(notice)}</div>` : ""}<div class="queue">${rows.map((row) => `<button class="queue-card" data-open-type="${esc(text(row, "source_type"))}" data-open-name="${esc(text(row, "name"))}"><span><strong>${esc(text(row, "source_type") === "Purchase Receipt" ? "Purchase Receipt" : "Stock Transfer Note")}</strong><small>${esc(text(row, "name"))}${text(row, "supplier") ? ` · ${esc(text(row, "supplier"))}` : ""}</small><small>${esc(text(row, "date"))} · ${esc(text(row, "branch"))}</small></span><b>${esc(text(row, "item_count"))} items ${icon("chevron-right", 18)}</b></button>`).join("") || `<div class="empty">${icon("check", 42)}<h2>All clear</h2><p>No pending receiving documents for your branch.</p></div>`}</div></section></main>`;
}

function documentView(): string {
  if (!current) return queueView();
  const isPr = text(current, "source_type") === "Purchase Receipt";
  const saved = draftMap()[keyFor(current)];
  const rows = list(saved?.items || current.items).map((row) => `<article class="line" data-line="${esc(text(row, "source_row"))}"><div class="line-top"><span><strong>${esc(text(row, "item_code"))}</strong><small>${esc(text(row, "item_name"))} · Expected ${esc(text(row, "expected_qty"))} ${esc(text(row, "uom"))}</small></span></div><div class="qty-grid"><label>Received<input class="qty-input" data-field="received_qty" type="number" inputmode="decimal" min="0" max="${esc(text(row, "expected_qty"))}" value="${esc(text(row, "received_qty"))}"></label><label>Damaged<input class="qty-input" data-field="damaged_qty" type="number" inputmode="decimal" min="0" value="${esc(text(row, "damaged_qty") || "0")}"></label></div>${isPr ? `<div class="qty-grid optional"><label>Batch no.<input data-field="batch_no" value="${esc(text(row, "batch_no"))}" autocomplete="off"></label><label>Expiry date<input data-field="expiry_date" type="date" value="${esc(text(row, "expiry_date"))}"></label></div>` : ""}</article>`).join("");
  return `<main><header class="top"><button id="back" class="secondary">${icon("chevron-left", 20)} Back</button><span class="${navigator.onLine ? "online" : "offline"}">${navigator.onLine ? "Online" : "Offline"}</span></header><section class="page"><div class="doc-head"><p class="eyebrow">${isPr ? "Purchase Receipt draft" : "Stock Transfer Note"}</p><h1>${esc(text(current, "name"))}</h1><small>${esc(text(current, "branch"))}${text(current, "supplier") ? ` · ${esc(text(current, "supplier"))}` : ""}</small></div>${notice ? `<div class="notice ${noticeTone}">${esc(notice)}</div>` : ""}<div class="line-list">${rows}</div><label>Remarks<textarea id="remarks" rows="3" placeholder="Optional note"></textarea></label><div class="actions"><button id="scan" class="secondary">${icon("search", 18)} Scan item</button><button id="save-draft" class="secondary">Save on device</button><button id="submit" class="primary" ${busy ? "disabled" : ""}>${busy || (isPr ? "Verify & Submit PR" : "Acknowledge STN")}</button></div></section></main>`;
}

function renderQueue(): void { if (!root.querySelector("main") || !current) root.innerHTML = queueView(); else root.innerHTML = documentView(); bind(); }
function render(): void { root.innerHTML = current ? documentView() : queueView(); bind(); }

function collectCurrent(): Row | null {
  if (!current) return null;
  const source = { ...current, items: Array.from(document.querySelectorAll<HTMLElement>("[data-line]")).map((line) => { const get = (field: string) => line.querySelector<HTMLInputElement>(`[data-field="${field}"]`)?.value || ""; const original = list(current!.items).find((row) => text(row, "source_row") === line.dataset.line) || {}; return { ...original, source_row: line.dataset.line, received_qty: Number(get("received_qty")) || 0, damaged_qty: Number(get("damaged_qty")) || 0, batch_no: get("batch_no"), expiry_date: get("expiry_date") }; }) }; return source; }
function saveCurrent(): void { const value = collectCurrent(); if (!value) return; const map = draftMap(); map[keyFor(value)] = value; saveRows(draftsKey, map); noticeText("Saved on this device. You can continue later.", "success"); render(); }

async function openDocument(sourceType: string, name: string): Promise<void> {
  if (!navigator.onLine) { noticeText("Connect to the server to open this document.", "warning"); render(); return; }
  busy = "Loading document"; renderQueue();
  try { current = await payload(await api!.getDocument(sourceType, name)); noticeText(""); render(); } catch (error) { noticeText(error instanceof Error ? error.message : "Unable to open document.", "danger"); renderQueue(); } finally { busy = ""; }
}

async function submitCurrent(): Promise<void> {
  const value = collectCurrent(); if (!value || !current) return;
  const request = { source_type: text(current, "source_type"), name: text(current, "name"), items: value.items, remarks: document.querySelector<HTMLTextAreaElement>("#remarks")?.value || "", idempotency_key: crypto.randomUUID() };
  if (!navigator.onLine) { const queue = outbox(); queue.push(request); saveRows(outboxKey, queue); noticeText("Saved safely. Connect to the server to finish receiving.", "warning"); current = null; render(); return; }
  busy = "Submitting…"; render();
  try { await payload(await api!.submitReceiving(request)); const map = draftMap(); delete map[keyFor(current)]; saveRows(draftsKey, map); noticeText("Receiving completed successfully.", "success"); current = null; await refreshPending(); } catch (error) { noticeText(error instanceof Error ? error.message : "Could not submit receiving.", "danger"); render(); } finally { busy = ""; }
}

async function syncOutbox(): Promise<void> {
  if (!navigator.onLine || !api) return;
  const queue = outbox(); if (!queue.length) return;
  const remaining: Row[] = [];
  for (const request of queue) { try { await payload(await api.submitReceiving(request as any)); } catch { remaining.push(request); } }
  saveRows(outboxKey, remaining);
  if (!remaining.length) noticeText("Saved receiving completed.", "success");
}

function bind(): void {
  document.querySelector<HTMLButtonElement>("#refresh")?.addEventListener("click", async () => { try { await refreshPending(); noticeText("Queue refreshed.", "success"); render(); } catch (error) { noticeText(error instanceof Error ? error.message : "Refresh failed.", "danger"); render(); } });
  document.querySelectorAll<HTMLButtonElement>("[data-open-type]").forEach((button) => button.addEventListener("click", () => void openDocument(button.dataset.openType!, button.dataset.openName!)));
  document.querySelector<HTMLButtonElement>("#back")?.addEventListener("click", () => { current = null; noticeText(""); render(); });
  document.querySelector<HTMLButtonElement>("#save-draft")?.addEventListener("click", saveCurrent);
  document.querySelector<HTMLButtonElement>("#submit")?.addEventListener("click", () => void submitCurrent());
  document.querySelector<HTMLButtonElement>("#scan")?.addEventListener("click", async () => { try { const code = await scanItemBarcode(); const matched = list(current?.items).find((row) => text(row, "item_code") === code || ((Array.isArray(row.barcodes) ? row.barcodes : []).map(String).includes(code))); const line = Array.from(document.querySelectorAll<HTMLElement>("[data-line]")).find((entry) => entry.dataset.line === text(matched, "source_row")); if (!line) throw new Error("This item is not in the receiving document."); const input = line.querySelector<HTMLInputElement>('[data-field="received_qty"]'); if (input) { input.value = line.querySelector("small")?.textContent?.match(/Expected ([0-9.]+)/)?.[1] || input.value; input.focus(); } } catch (error) { noticeText(error instanceof Error ? error.message : "Scan failed.", "warning"); render(); } });
  document.querySelectorAll<HTMLInputElement>("[data-field]").forEach((input) => input.addEventListener("change", () => { const value = collectCurrent(); if (value) { const map = draftMap(); map[keyFor(value)] = value; saveRows(draftsKey, map); } }));
}

async function start(): Promise<void> {
  const saved = localStorage.getItem(configKey);
  if (!saved) { setup(); return; }
  try { await configure((JSON.parse(saved) as OAuthPublicClientConfig).baseUrl); if (!await credentials!.getAccessToken()) { signIn(); return; } await loadContext(); } catch (error) { setup(error instanceof Error ? error.message : "Unable to start app."); }
}

window.addEventListener("online", () => { void syncOutbox().then(() => refreshPending().catch(() => undefined)); });
window.addEventListener("offline", () => { if (!current) render(); });
void start();
