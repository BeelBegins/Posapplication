import { App } from "@capacitor/app";
import { Geolocation } from "@capacitor/geolocation";
import { createHrApi } from "../../api/hr";
import { createApiClient } from "../../api/client";
import { normalizeErpDisplayText } from "../../core/display-branding";
import { capacitorOAuthBrowser } from "../../mobile/capacitor-oauth-browser";
import { OAuthPkceCredentialProvider, type OAuthPublicClientConfig } from "../../mobile/credential-provider";
import { androidSecureStorage } from "../../mobile/secure-storage";
import { bottomNavigation, emptyState, escapeHtml as esc, formatMoney, icon, loadingSkeleton, statusBadge } from "../shared/ui";
import {
  FACE_CONSENT_VERSION,
  attendanceCorrectionRequest,
  attendanceRequest,
  cameraPermissionDeniedMessage,
  canManageFaceEnrollment,
  canSubmitEnrollment,
  enrollFaceRequest,
  enrollmentPromptForIndex,
  leaveRequest,
  livenessPrompt,
} from "./domain";

declare const __APP_VERSION__: string;
type Row = Record<string, unknown>;
type Screen = "home" | "attendance" | "leave" | "pay" | "enroll" | "profile";
type PreviewScreen = Screen | "setup" | "signin";
type EnrollStep = "pick" | "consent" | "capture" | "review";
type HrApi = ReturnType<typeof createHrApi>;
type Tone = "" | "success" | "warn" | "danger" | "info";

const root = document.querySelector<HTMLElement>("#app")!;
const fetcher = globalThis.fetch.bind(globalThis);
const configKey = "aimatic-hr-config-v1";
const previewMode = new URLSearchParams(location.search).get("uiPreview") === "1";
const previewScreen = (new URLSearchParams(location.search).get("screen") || "home") as PreviewScreen;
const previewTheme = new URLSearchParams(location.search).get("theme") || "";

let config: OAuthPublicClientConfig | null = null;
let credentials: OAuthPkceCredentialProvider | null = null;
let api: HrApi | null = null;
let context: Row = {};
let screen: Screen = "home";
let message = "";
let tone: Tone = "";
let loading = "";
let leaveRows: Row[] = [];
let balances: Row = {};
let payslips: Row[] = [];
let requests: Row = {};
let team: Row[] = [];
let checkins: Row[] = [];
let options: Row = {};
let directory: Row[] = [];
let facePolicy: Row = {};
let previewUrl = "";
let enrollEmployee = "";
let enrollQuery = "";
let enrollCaptures: string[] = [];
let enrollConsent = false;
let enrollBusy = false;
let enrollSearching = false;
let enrollStep: EnrollStep = "pick";
let cameraOpen = false;
let cameraStarting = false;
let activeStream: MediaStream | null = null;
let backListenerReady = false;
let toastTimer = 0;

const text = (row: Row | undefined, ...keys: string[]) => {
  for (const key of keys) if (row?.[key] != null && row[key] !== "") return String(row[key]);
  return "";
};
const list = (value: unknown): Row[] => Array.isArray(value) ? value.filter((entry): entry is Row => Boolean(entry) && typeof entry === "object") : [];
const money = (value: unknown) => formatMoney(value, "PKR");
const isManager = () => canManageFaceEnrollment(context.roles);
const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "?";

async function payload(response: Response): Promise<Row> {
  const raw = await response.json().catch(() => ({})) as Row;
  const value = (raw.message && typeof raw.message === "object" ? raw.message : raw) as Row;
  if (!response.ok) throw new Error(normalizeErpDisplayText(text(value, "message", "exception") || `Server error ${response.status}`));
  return value;
}

function stopCamera(): void {
  activeStream?.getTracks().forEach((track) => track.stop());
  activeStream = null;
  cameraOpen = false;
  cameraStarting = false;
}

function setToast(next: string, nextTone: Tone = "info"): void {
  message = next;
  tone = nextTone;
  window.clearTimeout(toastTimer);
  if (next) toastTimer = window.setTimeout(() => { message = ""; tone = ""; const host = document.querySelector(".toast-host"); if (host) host.innerHTML = ""; }, 4200);
}

function toastHtml(): string {
  if (!message) return `<div class="toast-host" aria-live="polite"></div>`;
  return `<div class="toast-host" aria-live="polite"><div class="toast ${esc(tone || "info")}" role="status">${esc(message)}</div></div>`;
}

function btn(label: string, opts: { id?: string; kind?: "primary" | "secondary" | "text" | "danger"; block?: boolean; disabled?: boolean; attrs?: string } = {}): string {
  const kind = opts.kind || "primary";
  return `<button type="button" class="btn btn-${kind}${opts.block ? " btn-block" : ""}" ${opts.id ? `id="${opts.id}"` : ""} ${opts.disabled ? "disabled" : ""} ${opts.attrs || ""}>${label}</button>`;
}

function field(label: string, control: string): string {
  return `<div class="field"><label>${esc(label)}</label>${control}</div>`;
}

function avatar(name: string): string {
  return `<span class="avatar" aria-hidden="true">${esc(initials(name))}</span>`;
}

function appBar(subtitle: string, trailing = ""): string {
  return `<header class="app-bar"><div class="brand"><strong>Ai Matic HR</strong><small>${esc(subtitle || "Not signed in")}</small></div>${trailing}</header>`;
}

async function ensureBackHandler(): Promise<void> {
  if (backListenerReady || previewMode) return;
  backListenerReady = true;
  try {
    await App.addListener("backButton", () => {
      if (cameraOpen || cameraStarting) {
        stopCamera();
        setToast("Camera closed", "warn");
        render("enroll");
        return;
      }
      if (screen === "enroll" && enrollStep !== "pick") {
        enrollStep = enrollStep === "review" ? "capture" : enrollStep === "capture" ? "consent" : "pick";
        render("enroll");
        return;
      }
      if (screen === "enroll") { render("home"); return; }
      if (screen !== "home") { render("home"); return; }
      void App.exitApp();
    });
  } catch { /* browser */ }
}

async function configure(baseUrl: string) {
  const url = baseUrl.replace(/\/+$/, "");
  const pub = await payload(await fetcher(`${url}/api/method/aimatichr.hr_mobile.api.get_public_config`, { method: "POST" }));
  config = { baseUrl: url, clientId: text(pub, "oauth_client_id"), redirectUri: text(pub, "redirect_uri"), scope: text(pub, "scope") };
  if (!config.clientId || !config.redirectUri) throw new Error("HR OAuth is not configured on this site.");
  localStorage.setItem(configKey, JSON.stringify(config));
  credentials = new OAuthPkceCredentialProvider(async () => config!, androidSecureStorage, capacitorOAuthBrowser, fetcher);
  api = createHrApi(createApiClient({ baseUrl: url, authentication: { mode: "user-session", credentials }, fetch: fetcher }));
}

function setup(error = "") {
  stopCamera();
  root.innerHTML = `${toastHtml()}<section class="setup"><div class="setup-card">
    <div class="mark">HR</div>
    <div class="stack-sm"><p class="t-label">Employee workspace</p><h1 class="t-display">Ai Matic HR</h1><p class="t-meta">Connect to your ERP, then sign in with your own employee account. Attendance, leave and pay stay on the server.</p></div>
    ${error ? `<div class="banner danger">${esc(error)}</div>` : ""}
    <form id="setup" class="stack">
      ${field("ERP URL", `<input id="url" type="url" required placeholder="https://siezal.aimatic.tech" autocomplete="url">`)}
      ${btn("Continue", { kind: "primary", block: true, attrs: 'type="submit"' })}
    </form>
    <p class="t-meta">v${esc(__APP_VERSION__)} · Public OAuth · No API secret</p>
  </div></section>`;
  document.querySelector<HTMLFormElement>("#setup")!.onsubmit = async (event) => {
    event.preventDefault();
    try { await configure(document.querySelector<HTMLInputElement>("#url")!.value); signIn(); }
    catch (reason) { setup(reason instanceof Error ? reason.message : "Connection failed"); }
  };
}

function signIn() {
  stopCamera();
  root.innerHTML = `${toastHtml()}<section class="setup"><div class="setup-card">
    <div class="mark">${icon("shield", 28)}</div>
    <div class="stack-sm"><p class="t-label">Secure access</p><h1 class="t-display">Sign in</h1><p class="t-meta">Use your ERP account. The app cannot choose another employee.</p></div>
    ${message ? `<div class="banner danger">${esc(message)}</div>` : ""}
    ${btn(`${icon("log-in", 18)} Sign in with ERP`, { id: "login", kind: "primary", block: true })}
    ${btn("Change ERP server", { id: "change-server", kind: "secondary", block: true })}
  </div></section>`;
  document.querySelector<HTMLButtonElement>("#login")!.onclick = async () => {
    try { await credentials!.login(); await loadContext(); }
    catch (error) { message = error instanceof Error ? error.message : "Sign in failed"; signIn(); }
  };
  document.querySelector<HTMLButtonElement>("#change-server")!.onclick = () => { localStorage.removeItem(configKey); config = null; setup(); };
}

function seedPreview(): void {
  context = {
    employee: "HR-EMP-00063",
    employee_name: "Ahmed Nabeel",
    designation: "Systems Lead",
    department: "Technology",
    company: "Siezal Supermarket",
    face_enrolled: false,
    verifier_ready: true,
    mobile_checkin_enabled: true,
    roles: ["Employee", "HR Manager", "System Manager"],
    face_policy: { consent_version: FACE_CONSENT_VERSION, purpose: "attendance-checkin-checkout", stores_raw_images: false },
  };
  facePolicy = context.face_policy as Row;
  checkins = [
    { log_type: "IN", time: "2026-11-17 09:02:11", shift: "General" },
    { log_type: "OUT", time: "2026-11-16 18:11:04", shift: "General" },
  ];
  leaveRows = [{ leave_type: "Casual Leave", status: "Open", from_date: "2026-11-20", to_date: "2026-11-20" }];
  balances = { "Casual Leave": { balance_leaves: 6 }, "Annual Leave": { balance_leaves: 12 } };
  payslips = [{ name: "Sal Slip/Nov/0001", net_pay: 185000, start_date: "2026-11-01", end_date: "2026-11-30" }];
  team = [{ employee_name: "Sara Khan", designation: "HR Executive", department: "People" }];
  directory = [
    { name: "HR-EMP-00063", employee_name: "Ahmed Nabeel", designation: "Systems Lead", department: "Technology" },
    { name: "HR-EMP-00012", employee_name: "Sara Khan", designation: "HR Executive", department: "People" },
  ];
  enrollEmployee = "HR-EMP-00063";
  enrollQuery = "Nabeel";
  enrollConsent = previewScreen === "enroll";
  enrollCaptures = previewScreen === "enroll" ? ["data:image/jpeg;base64,/9j/4AAQ", "data:image/jpeg;base64,/9j/4AAQ", "data:image/jpeg;base64,/9j/4AAQ"] : [];
  enrollStep = (new URLSearchParams(location.search).get("step") as EnrollStep) || "pick";
  options = { leave_types: ["Casual Leave", "Annual Leave"] };
  requests = { attendance: [], expenses: [], shifts: [] };
}

async function loadContext() {
  loading = "Loading your HR workspace";
  render();
  context = await payload(await api!.getContext());
  facePolicy = (context.face_policy && typeof context.face_policy === "object" ? context.face_policy : {}) as Row;
  loading = "";
  setToast("");
  render("home");
  void refresh();
}

async function refresh() {
  if (!api || previewMode) return;
  try {
    if (offline()) throw new Error("You appear offline. Reconnect, then refresh.");
    const tasks: Array<Promise<Row | Row[]>> = [
      api.getLeaveSummary().then(payload),
      api.getPayslips().then(payload),
      api.getRequests().then(payload),
      api.getTeam().then(payload),
      api.getRecentCheckins().then(payload),
      api.getFormOptions().then(payload),
    ];
    if (isManager()) {
      tasks.push(api.getDirectory(enrollQuery).then(payload));
      tasks.push(api.getFacePolicy().then(payload));
    }
    const results = await Promise.all(tasks);
    const [leave, pay, requestRows, teamRows, logs, formOptions] = results as Row[];
    leaveRows = list(leave.applications);
    balances = (leave.balances && typeof leave.balances === "object" ? leave.balances : {}) as Row;
    payslips = list(pay);
    requests = requestRows;
    team = list(teamRows);
    checkins = list(logs);
    options = formOptions;
    if (isManager()) {
      directory = list(results[6]);
      facePolicy = (results[7] && typeof results[7] === "object" ? results[7] as Row : facePolicy);
    }
    if (!loading) render(screen);
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Could not refresh HR data", "danger");
    render(screen);
  }
}

function home() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const latest = checkins[0];
  const balanceCards = Object.entries(balances).slice(0, 4).map(([name, value]) => {
    const row = value && typeof value === "object" ? value as Row : {};
    return `<article class="card-flat"><p class="t-label">${esc(name)}</p><strong class="t-subtitle">${esc(row.balance_leaves ?? "-")}</strong><p class="t-meta">days left</p></article>`;
  }).join("");
  return `<section class="stack">
    <article class="card hero-card stack">
      <p class="t-label">${esc(greet)}</p>
      <h1 class="t-display">${esc(text(context, "employee_name") || "Employee")}</h1>
      <p class="t-meta">${esc([text(context, "designation"), text(context, "department")].filter(Boolean).join(" · "))}</p>
      <div class="row-between">
        <span class="chip ${context.verifier_ready ? "success" : "warn"}">${context.verifier_ready ? "Face ready" : "Face not ready"}</span>
        <span class="chip ${context.face_enrolled ? "success" : "warn"}">${context.face_enrolled ? "Enrolled" : "Not enrolled"}</span>
      </div>
      <div class="card-flat hero-attend">
        <p class="t-label">Today’s attendance</p>
        <strong>${latest ? `${esc(text(latest, "log_type"))} · ${esc(text(latest, "time"))}` : "No check-in yet today"}</strong>
      </div>
    </article>
    <div class="qa">
      <button class="qa-btn" data-screen="attendance"><span class="icon">${icon("log-in", 18)}</span><strong>Check in / out</strong><span class="t-meta">Face + GPS</span></button>
      <button class="qa-btn" data-screen="leave"><span class="icon">${icon("calendar", 18)}</span><strong>Request leave</strong><span class="t-meta">Send to ERP</span></button>
      ${isManager() ? `<button class="qa-btn" data-screen="enroll"><span class="icon">${icon("camera", 18)}</span><strong>Enroll face</strong><span class="t-meta">Managers</span></button>` : ""}
      <button class="qa-btn" data-screen="profile"><span class="icon">${icon("user", 18)}</span><strong>Profile</strong><span class="t-meta">Team & requests</span></button>
    </div>
    <div class="grid-2">${balanceCards || `<article class="card-flat"><strong>Leave</strong><p class="t-meta">No balance returned</p></article>`}<article class="card-flat"><p class="t-label">Direct reports</p><strong class="t-subtitle">${esc(String(team.length))}</strong></article></div>
    ${btn(`${icon("refresh", 16)} Refresh`, { id: "refresh", kind: "secondary", block: true })}
  </section>`;
}

function attendance() {
  const history = checkins.length
    ? `<div class="list">${checkins.map((row) => `<article class="list-row"><span class="icon-btn" style="width:40px;height:40px;display:grid;place-items:center;background:var(--surface-2);border-radius:12px">${icon(text(row, "log_type") === "OUT" ? "log-out" : "log-in", 18)}</span><div class="grow"><strong>${esc(text(row, "log_type") || "Log")}</strong><span class="t-meta">${esc(text(row, "time"))}</span></div>${statusBadge(text(row, "shift") || "ERP", "info")}</article>`).join("")}</div>`
    : emptyState(icon("clock", 28), "No recent check-ins", "Successful check-ins from ERP will appear here.");
  return `<section class="stack">
    <article class="card stack">
      <p class="t-label">Live attendance</p>
      <h2 class="t-title">Check in or out</h2>
      <p class="t-meta">The server owns employee, time and face match. This phone sends GPS, a challenge and one live frame.</p>
      ${previewUrl ? `<div class="stage"><img class="preview" alt="Capture preview" src="${esc(previewUrl)}"><div class="oval" aria-hidden="true"></div></div>` : ""}
      <p class="banner" id="liveness" hidden></p>
      <div class="grid-2">
        ${btn(`${icon("log-in", 16)} Check in`, { kind: "primary", block: true, attrs: 'data-log="IN"' })}
        ${btn(`${icon("log-out", 16)} Check out`, { kind: "secondary", block: true, attrs: 'data-log="OUT"' })}
      </div>
    </article>
    <div class="stack-sm"><h3 class="t-subtitle">History</h3>${history}</div>
  </section>`;
}

function leave() {
  const typeOptions = (Array.isArray(options.leave_types) ? options.leave_types : []).map((entry) => `<option>${esc(String(entry))}</option>`).join("");
  const rows = leaveRows.length
    ? `<div class="list">${leaveRows.map((row) => `<article class="list-row"><div class="grow"><strong>${esc(text(row, "leave_type"))}</strong><span class="t-meta">${esc(text(row, "from_date"))} → ${esc(text(row, "to_date"))}</span></div>${statusBadge(text(row, "status") || "Open", "info")}</article>`).join("")}</div>`
    : emptyState(icon("calendar", 28), "No leave applications", "Submitted leave will show here.");
  return `<section class="stack">
    <form id="leave" class="card stack">
      <p class="t-label">Request leave</p>
      <h2 class="t-title">New application</h2>
      ${field("Leave type", `<select name="leaveType" required>${typeOptions || "<option value=''>No allocated leave</option>"}</select>`)}
      <div class="grid-2">
        ${field("From", `<input name="fromDate" type="date" required>`)}
        ${field("To", `<input name="toDate" type="date" required>`)}
      </div>
      ${field("Note", `<textarea name="description" placeholder="Optional note"></textarea>`)}
      ${btn("Submit to ERP", { kind: "primary", block: true, attrs: 'type="submit"' })}
    </form>
    ${rows}
  </section>`;
}

function pay() {
  if (!payslips.length) return emptyState(icon("credit-card", 28), "No payslips", "Posted salary slips will appear here.");
  return `<section class="stack"><h2 class="t-title">Payslips</h2><div class="list">${payslips.map((row) => `<article class="list-row"><div class="grow"><strong>${esc(text(row, "name"))}</strong><span class="t-meta">${esc(text(row, "start_date"))} → ${esc(text(row, "end_date"))}</span></div><strong>${esc(money(row.net_pay))}</strong></article>`).join("")}</div></section>`;
}

function enrollStepper(): string {
  const steps: Array<{ id: EnrollStep; label: string }> = [
    { id: "pick", label: "Employee" },
    { id: "consent", label: "Consent" },
    { id: "capture", label: "Capture" },
    { id: "review", label: "Review" },
  ];
  const order = steps.map((step) => step.id);
  const current = order.indexOf(enrollStep);
  return `<div class="stepper" aria-label="Enrollment steps">${steps.map((step, index) => {
    const state = index < current ? "done" : index === current ? "active" : "";
    return `<div class="step ${state}"><span class="dot">${index < current ? icon("check", 14) : index + 1}</span><span>${step.label}</span></div>`;
  }).join("")}</div>`;
}

function enroll() {
  if (!isManager()) return emptyState(icon("shield", 28), "Managers only", "Face enrollment is limited to HR Manager or System Manager.");
  const selected = directory.find((row) => text(row, "name") === enrollEmployee);
  const policyVersion = text(facePolicy, "consent_version") || FACE_CONSENT_VERSION;
  const picks = directory.slice(0, 40).map((row) => {
    const id = text(row, "name");
    return `<button type="button" class="list-row ${id === enrollEmployee ? "active" : ""}" data-employee="${esc(id)}" aria-pressed="${id === enrollEmployee}">${avatar(text(row, "employee_name") || id)}<div class="grow"><strong>${esc(text(row, "employee_name") || id)}</strong><span class="t-meta">${esc([id, text(row, "designation"), text(row, "department")].filter(Boolean).join(" · "))}</span></div></button>`;
  }).join("");

  if (enrollStep === "pick") {
    return `<section class="stack">
      ${enrollStepper()}
      <article class="card stack">
        <p class="t-label">Manager enrollment</p>
        <h2 class="t-title">Choose employee</h2>
        <p class="t-meta">Completing this flow also finishes an existing Pending record for the same employee.</p>
        <form id="enroll-search" class="stack">
          ${field("Search directory", `<input id="enroll-query" value="${esc(enrollQuery)}" placeholder="Name, code, or department" autocomplete="off">`)}
          ${btn(enrollSearching ? "Searching…" : `${icon("search", 16)} Search`, { kind: "secondary", block: true, disabled: enrollSearching || enrollBusy, attrs: 'type="submit"' })}
        </form>
        <div class="list">${picks || emptyState(icon("users", 28), "No employees yet", "Search the directory, then select who to enroll.")}</div>
        ${selected ? `<div class="banner success">Selected ${esc(text(selected, "employee_name"))} (${esc(text(selected, "name"))})</div>` : `<div class="banner warn">Pick an employee to continue.</div>`}
        ${btn("Continue to consent", { id: "enroll-next", kind: "primary", block: true, disabled: !enrollEmployee })}
      </article>
    </section>`;
  }

  if (enrollStep === "consent") {
    return `<section class="stack">
      ${enrollStepper()}
      <article class="card stack">
        <p class="t-label">Consent</p>
        <h2 class="t-title">Record employee consent</h2>
        <p class="t-meta">Policy <code>${esc(policyVersion)}</code> · attendance check-in/out only.</p>
        <ul class="t-meta" style="margin:0;padding-left:18px;display:grid;gap:6px">
          <li>Encrypted face template is stored. Raw photos are not kept.</li>
          <li>No commercial face API is used.</li>
          <li>An HR manager can revoke and wipe later.</li>
        </ul>
        <button type="button" class="consent" id="enroll-consent-toggle" aria-pressed="${enrollConsent ? "true" : "false"}">
          <span class="box" aria-hidden="true">${enrollConsent ? icon("check", 14) : ""}</span>
          <span>I confirm the employee consented under <strong>${esc(policyVersion)}</strong>.
            <small>Required before camera capture.</small>
          </span>
        </button>
        <div class="grid-2">
          ${btn("Back", { id: "enroll-back", kind: "secondary", block: true })}
          ${btn("Continue to capture", { id: "enroll-next", kind: "primary", block: true, disabled: !enrollConsent })}
        </div>
      </article>
    </section>`;
  }

  if (enrollStep === "capture") {
    const prompt = enrollmentPromptForIndex(enrollCaptures.length);
    const stage = cameraOpen || cameraStarting
      ? `<div class="stage"><video id="enroll-video" playsinline muted autoplay></video><div class="oval" aria-hidden="true"></div><div class="stage-meta"><span>${esc(prompt)}</span><span>${enrollCaptures.length}/5</span></div></div>`
      : previewUrl
        ? `<div class="stage"><img class="preview" alt="Last capture" src="${esc(previewUrl)}"><div class="oval" aria-hidden="true"></div></div>`
        : `<div class="stage"><div class="stage-meta"><span>Camera closed</span><span>${enrollCaptures.length}/5</span></div></div>`;
    const thumbs = enrollCaptures.map((image, index) => `<div class="thumb-wrap"><img class="thumb" alt="Capture ${index + 1}" src="${esc(image)}"><button type="button" class="btn-icon" data-retake="${index}" aria-label="Remove photo ${index + 1}">${icon("x", 16)}</button></div>`).join("");
    return `<section class="stack">
      ${enrollStepper()}
      <article class="card stack">
        <p class="t-label">Capture</p>
        <h2 class="t-title">Live face photos</h2>
        <p class="t-meta">Center the face in the oval. Face a light source. Avoid backlight. Take 3 to 5 photos.</p>
        <div class="banner">${esc(prompt)}</div>
        ${stage}
        <div class="grid-2">
          ${btn(cameraOpen ? "Camera on" : `${icon("camera", 16)} Open camera`, { id: "open-camera", kind: "secondary", block: true, disabled: enrollBusy || enrollCaptures.length >= 5 })}
          ${btn(`Take photo (${enrollCaptures.length}/5)`, { id: "capture-enroll", kind: "primary", block: true, disabled: enrollBusy || !cameraOpen || enrollCaptures.length >= 5 })}
        </div>
        <div class="grid-2">
          ${btn("Remove last", { id: "retake-last", kind: "text", block: true, disabled: !enrollCaptures.length || enrollBusy })}
          ${btn("Clear all", { id: "clear-enroll", kind: "text", block: true, disabled: !enrollCaptures.length || enrollBusy })}
        </div>
        <div class="thumbs">${thumbs || `<div class="banner warn">No photos yet.</div>`}</div>
        <div class="grid-2">
          ${btn("Back", { id: "enroll-back", kind: "secondary", block: true })}
          ${btn("Review photos", { id: "enroll-next", kind: "primary", block: true, disabled: enrollCaptures.length < 3 })}
        </div>
        ${btn("Close camera", { id: "close-camera", kind: "secondary", block: true, disabled: !(cameraOpen || cameraStarting) })}
      </article>
    </section>`;
  }

  const ready = canSubmitEnrollment({ employee: enrollEmployee, images: enrollCaptures, consent: enrollConsent, busy: enrollBusy });
  const thumbs = enrollCaptures.map((image, index) => `<div class="thumb-wrap"><img class="thumb" alt="Capture ${index + 1}" src="${esc(image)}"><button type="button" class="btn-icon" data-retake="${index}" aria-label="Remove photo ${index + 1}">${icon("x", 16)}</button></div>`).join("");
  return `<section class="stack">
    ${enrollStepper()}
    <article class="card stack">
      <p class="t-label">Review & submit</p>
      <h2 class="t-title">Complete enrollment</h2>
      <div class="list-row">${avatar(text(selected, "employee_name") || enrollEmployee)}<div class="grow"><strong>${esc(text(selected, "employee_name") || enrollEmployee)}</strong><span class="t-meta">${esc(enrollEmployee)} · consent ${esc(policyVersion)} · ${enrollCaptures.length} photos</span></div></div>
      <div class="thumbs">${thumbs}</div>
      <div class="banner">Submitting will create or update the HR Face Enrollment row, including Pending records such as 8bni3r68lh.</div>
      <div class="grid-2">
        ${btn("Back to capture", { id: "enroll-back", kind: "secondary", block: true, disabled: enrollBusy })}
        ${btn(enrollBusy ? "Enrolling…" : "Submit enrollment", { id: "submit-enroll", kind: "primary", block: true, disabled: !ready })}
      </div>
    </article>
  </section>`;
}

function profile() {
  const requestCards = ["attendance", "expenses", "shifts"].map((key) => {
    const items = list(requests[key]);
    return `<article class="card-flat"><p class="t-label">${esc(key)}</p><strong class="t-subtitle">${items.length}</strong><p class="t-meta">open records</p></article>`;
  }).join("");
  return `<section class="stack">
    <article class="card stack">
      <div class="list-row" style="border:0;padding:0;box-shadow:none">${avatar(text(context, "employee_name"))}<div class="grow"><h2 class="t-title">${esc(text(context, "employee_name"))}</h2><p class="t-meta">${esc(text(context, "employee"))} · ${esc(text(context, "company"))}</p></div></div>
      ${isManager() ? btn(`${icon("camera", 16)} Open face enrollment`, { kind: "secondary", block: true, attrs: 'data-screen="enroll"' }) : `<p class="t-meta">Face enrolled: ${context.face_enrolled ? "yes" : "no"}.</p>`}
      ${btn(`${icon("log-out", 16)} Sign out`, { id: "sign-out", kind: "danger", block: true })}
    </article>
    <div class="grid-2">${requestCards}</div>
    <div class="stack-sm"><h3 class="t-subtitle">Team</h3>${team.length ? `<div class="list">${team.map((row) => `<article class="list-row">${avatar(text(row, "employee_name"))}<div class="grow"><strong>${esc(text(row, "employee_name"))}</strong><span class="t-meta">${esc(text(row, "designation") || text(row, "department"))}</span></div></article>`).join("")}</div>` : emptyState(icon("users", 28), "No direct reports", "People who report to you will appear here.")}</div>
    <form id="correction" class="card stack">
      <p class="t-label">Attendance request</p>
      ${field("Reason", `<select name="reason"><option>Work From Home</option><option>On Duty</option></select>`)}
      <div class="grid-2">${field("From", `<input name="fromDate" type="date" required>`)}${field("To", `<input name="toDate" type="date" required>`)}</div>
      ${field("Explanation", `<textarea name="explanation"></textarea>`)}
      ${btn("Send request", { kind: "primary", block: true, attrs: 'type="submit"' })}
    </form>
  </section>`;
}

function render(next: Screen = screen) {
  if (next !== "enroll" && (cameraOpen || cameraStarting)) stopCamera();
  screen = next;
  if (previewTheme === "light" || previewTheme === "dark") document.documentElement.dataset.theme = previewTheme;
  if (loading) {
    root.innerHTML = `${toastHtml()}<section class="setup"><div class="setup-card"><p class="t-label">Loading</p><div class="skeleton" aria-busy="true">${loadingSkeleton(4)}</div><p class="t-meta">${esc(loading)}</p></div></section>`;
    return;
  }
  const pages: Record<Screen, () => string> = { home, attendance, leave, pay, enroll, profile };
  const nav = [
    { id: "home", label: "Home", icon: icon("home", 22) },
    { id: "attendance", label: "Attend", icon: icon("map-pin", 22) },
    { id: "leave", label: "Leave", icon: icon("calendar", 22) },
    { id: "pay", label: "Pay", icon: icon("credit-card", 22) },
    ...(isManager() ? [{ id: "enroll", label: "Enroll", icon: icon("camera", 22) }] : []),
    { id: "profile", label: "Profile", icon: icon("user", 22) },
  ];
  if (!isManager() && screen === "enroll") screen = "home";
  root.innerHTML = `${toastHtml()}<section class="shell">${appBar(text(context, "employee_name") || "Employee")}<main class="page">${pages[screen]()}</main>${bottomNavigation("HR", screen, nav)}</section>`;
  bind();
  if (screen === "enroll" && cameraOpen && activeStream) attachPreview(activeStream);
  void ensureBackHandler();
}

function attachPreview(stream: MediaStream): void {
  const video = document.querySelector<HTMLVideoElement>("#enroll-video");
  if (!video) return;
  video.srcObject = stream;
  void video.play().catch(() => setToast("Could not start the live preview.", "danger"));
}

function bind() {
  document.querySelectorAll<HTMLButtonElement>("[data-screen]").forEach((button) => {
    button.onclick = () => {
      setToast("");
      if (button.dataset.screen !== "enroll") stopCamera();
      if (button.dataset.screen === "enroll") enrollStep = "pick";
      render(button.dataset.screen as Screen);
    };
  });
  document.querySelector<HTMLButtonElement>("#refresh")?.addEventListener("click", () => void refresh());
  document.querySelectorAll<HTMLButtonElement>("[data-log]").forEach((button) => {
    button.onclick = () => void submitLog(button.dataset.log === "OUT" ? "OUT" : "IN");
  });
  document.querySelector<HTMLFormElement>("#leave")?.addEventListener("submit", (event) => void submitLeave(event));
  document.querySelector<HTMLFormElement>("#correction")?.addEventListener("submit", (event) => void submitCorrection(event));
  document.querySelector<HTMLFormElement>("#enroll-search")?.addEventListener("submit", (event) => void searchDirectory(event));
  document.querySelectorAll<HTMLButtonElement>("[data-employee]").forEach((button) => {
    button.onclick = () => {
      enrollEmployee = button.dataset.employee || "";
      setToast(`Selected ${enrollEmployee}`, "success");
      render("enroll");
    };
  });
  document.querySelector<HTMLButtonElement>("#enroll-consent-toggle")?.addEventListener("click", () => {
    enrollConsent = !enrollConsent;
    render("enroll");
  });
  document.querySelector<HTMLButtonElement>("#enroll-next")?.addEventListener("click", () => {
    if (enrollStep === "pick" && enrollEmployee) enrollStep = "consent";
    else if (enrollStep === "consent" && enrollConsent) enrollStep = "capture";
    else if (enrollStep === "capture" && enrollCaptures.length >= 3) { stopCamera(); enrollStep = "review"; }
    render("enroll");
  });
  document.querySelector<HTMLButtonElement>("#enroll-back")?.addEventListener("click", () => {
    if (enrollStep === "consent") enrollStep = "pick";
    else if (enrollStep === "capture") { stopCamera(); enrollStep = "consent"; }
    else if (enrollStep === "review") enrollStep = "capture";
    render("enroll");
  });
  document.querySelector<HTMLButtonElement>("#open-camera")?.addEventListener("click", () => void openEnrollmentCamera());
  document.querySelector<HTMLButtonElement>("#close-camera")?.addEventListener("click", () => { stopCamera(); setToast("Camera closed", "warn"); render("enroll"); });
  document.querySelector<HTMLButtonElement>("#capture-enroll")?.addEventListener("click", () => void captureEnrollmentPhoto());
  document.querySelector<HTMLButtonElement>("#retake-last")?.addEventListener("click", () => {
    enrollCaptures = enrollCaptures.slice(0, -1);
    previewUrl = enrollCaptures[enrollCaptures.length - 1] || "";
    setToast(enrollCaptures.length ? `Removed last photo. ${enrollCaptures.length}/5 kept.` : "All photos cleared.", "warn");
    render("enroll");
  });
  document.querySelectorAll<HTMLButtonElement>("[data-retake]").forEach((button) => {
    button.onclick = () => {
      const index = Number(button.dataset.retake);
      if (!Number.isInteger(index)) return;
      enrollCaptures = enrollCaptures.filter((_, i) => i !== index);
      previewUrl = enrollCaptures[enrollCaptures.length - 1] || "";
      setToast(`Removed photo ${index + 1}.`, "warn");
      render("enroll");
    };
  });
  document.querySelector<HTMLButtonElement>("#clear-enroll")?.addEventListener("click", () => {
    enrollCaptures = [];
    previewUrl = "";
    setToast("All enrollment photos cleared.", "warn");
    render("enroll");
  });
  document.querySelector<HTMLButtonElement>("#submit-enroll")?.addEventListener("click", () => void submitEnrollment());
  document.querySelector<HTMLButtonElement>("#sign-out")?.addEventListener("click", () => {
    stopCamera();
    void credentials?.clear();
    credentials = null;
    api = null;
    context = {};
    enrollEmployee = "";
    enrollCaptures = [];
    enrollConsent = false;
    enrollStep = "pick";
    setup();
  });
}

async function searchDirectory(event: Event) {
  event.preventDefault();
  if (!api || !isManager() || enrollBusy || previewMode) {
    if (previewMode) { setToast("Preview directory ready", "success"); render("enroll"); }
    return;
  }
  enrollQuery = document.querySelector<HTMLInputElement>("#enroll-query")?.value.trim() || "";
  enrollSearching = true;
  render("enroll");
  try {
    if (offline()) throw new Error("You appear offline. Reconnect, then search again.");
    directory = list(await payload(await api.getDirectory(enrollQuery)));
    setToast(directory.length ? `Found ${directory.length} employee${directory.length === 1 ? "" : "s"}` : "No employees matched", directory.length ? "success" : "warn");
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Directory search failed", "danger");
  } finally {
    enrollSearching = false;
    render("enroll");
  }
}

async function captureLocation() {
  let permission = await Geolocation.checkPermissions();
  if (permission.location !== "granted") permission = await Geolocation.requestPermissions({ permissions: ["location"] });
  if (permission.location !== "granted") throw new Error("Precise location permission is required. Enable Location for Ai Matic HR in Android Settings, then retry.");
  const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

function frameQualityIssue(canvas: HTMLCanvasElement): string | null {
  const context2d = canvas.getContext("2d");
  if (!context2d) return "Camera capture failed.";
  const { data } = context2d.getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 64) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    count += 1;
  }
  const average = sum / Math.max(count, 1);
  if (average < 28) return "Photo looks too dark. Face a light source and retry.";
  if (average > 245) return "Photo looks overexposed. Avoid strong backlight and retry.";
  return null;
}

async function openEnrollmentCamera(): Promise<void> {
  if (!enrollEmployee) { setToast("Pick an employee before opening the camera.", "warn"); render("enroll"); return; }
  if (enrollCaptures.length >= 5) return;
  cameraStarting = true;
  setToast("Camera is needed for live enrollment photos.", "warn");
  render("enroll");
  try {
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "user" }, width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false,
    });
    activeStream = stream;
    cameraOpen = true;
    cameraStarting = false;
    setToast(enrollmentPromptForIndex(enrollCaptures.length), "success");
    render("enroll");
  } catch (error) {
    stopCamera();
    setToast(cameraPermissionDeniedMessage(error) || (error instanceof Error ? error.message : "Camera could not start"), "danger");
    render("enroll");
  }
}

async function captureStillFromStream(prompt: string): Promise<string> {
  if (!activeStream) throw new Error("Open the camera first.");
  const video = document.querySelector<HTMLVideoElement>("#enroll-video");
  if (!video) throw new Error("Live preview is not ready yet.");
  const note = document.querySelector("#liveness");
  if (note) note.textContent = prompt;
  if (video.readyState < 2) {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error("Live preview failed.")); };
      const cleanup = () => { video.removeEventListener("loadeddata", onReady); video.removeEventListener("error", onError); };
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
    });
  }
  await new Promise((resolve) => window.setTimeout(resolve, 350));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(480, video.videoWidth || 480);
  canvas.height = Math.max(640, video.videoHeight || 640);
  const context2d = canvas.getContext("2d");
  if (!context2d) throw new Error("Camera capture failed.");
  context2d.drawImage(video, 0, 0, canvas.width, canvas.height);
  const quality = frameQualityIssue(canvas);
  if (quality) throw new Error(quality);
  previewUrl = canvas.toDataURL("image/jpeg", 0.86);
  return previewUrl;
}

async function captureFace(prompt: string): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    await video.play();
    const note = document.querySelector<HTMLElement>("#liveness");
    if (note) { note.hidden = false; note.textContent = prompt; }
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 640;
    const context2d = canvas.getContext("2d");
    if (!context2d) throw new Error("Camera capture failed.");
    context2d.drawImage(video, 0, 0, canvas.width, canvas.height);
    const quality = frameQualityIssue(canvas);
    if (quality) throw new Error(quality);
    previewUrl = canvas.toDataURL("image/jpeg", 0.82);
    return previewUrl;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

async function captureEnrollmentPhoto() {
  if (enrollCaptures.length >= 5 || enrollBusy) return;
  try {
    const image = await captureStillFromStream(enrollmentPromptForIndex(enrollCaptures.length));
    enrollCaptures = [...enrollCaptures, image];
    setToast(`Captured photo ${enrollCaptures.length} of 5.`, "success");
    if (enrollCaptures.length >= 5) stopCamera();
    render("enroll");
  } catch (error) {
    setToast(cameraPermissionDeniedMessage(error) || (error instanceof Error ? error.message : "Camera capture failed"), "danger");
    render("enroll");
  }
}

async function submitEnrollment() {
  if (!api || !isManager() || enrollBusy || previewMode) {
    if (previewMode) setToast("Preview mode — enrollment not sent.", "warn");
    return;
  }
  try {
    if (offline()) throw new Error("You appear offline. Enrollment was not sent.");
    const body = enrollFaceRequest({
      employee: enrollEmployee,
      images: enrollCaptures,
      consent: enrollConsent,
      consentVersion: text(facePolicy, "consent_version") || FACE_CONSENT_VERSION,
    });
    enrollBusy = true;
    stopCamera();
    setToast("Submitting enrollment to ERP…", "warn");
    render("enroll");
    const saved = await payload(await api.enrollFace(body));
    enrollCaptures = [];
    enrollConsent = false;
    previewUrl = "";
    enrollStep = "pick";
    setToast(`Enrollment complete for ${enrollEmployee}. Status: ${text(saved, "status") || "Enrolled"}.`, "success");
    context = await payload(await api.getContext());
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Enrollment failed", "danger");
  } finally {
    enrollBusy = false;
    render("enroll");
  }
}

async function submitLog(logType: "IN" | "OUT") {
  if (!api || previewMode) {
    if (previewMode) setToast(`Preview ${logType}`, "success");
    return;
  }
  setToast("Requesting a server challenge", "info");
  render("attendance");
  try {
    if (offline()) throw new Error("You appear offline. Attendance was not recorded.");
    const challenge = text(await payload(await api.requestCheckinChallenge()), "challenge");
    const location = await captureLocation();
    const image = await captureFace(livenessPrompt(challenge));
    const body = attendanceRequest({ logType, ...location, challenge, image });
    const saved = await payload(await api.submitAttendance(body));
    setToast(`Recorded ${text(saved, "name")}`, "success");
    await refresh();
  } catch (error) {
    setToast(cameraPermissionDeniedMessage(error) || (error instanceof Error ? error.message : "Attendance was not recorded"), "danger");
    render("attendance");
  }
}

async function submitLeave(event: Event) {
  event.preventDefault();
  if (!api || previewMode) return;
  const form = event.currentTarget as HTMLFormElement;
  const data = new FormData(form);
  try {
    const body = leaveRequest({
      leaveType: String(data.get("leaveType") || ""),
      fromDate: String(data.get("fromDate") || ""),
      toDate: String(data.get("toDate") || ""),
      description: String(data.get("description") || ""),
    });
    const saved = await payload(await api.createLeaveApplication(body));
    setToast(`Leave ${text(saved, "name")} sent to ERP`, "success");
    await refresh();
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Leave was not submitted", "danger");
    render("leave");
  }
}

async function submitCorrection(event: Event) {
  event.preventDefault();
  if (!api || previewMode) return;
  const data = new FormData(event.currentTarget as HTMLFormElement);
  try {
    const body = attendanceCorrectionRequest({
      fromDate: String(data.get("fromDate") || ""),
      toDate: String(data.get("toDate") || ""),
      reason: String(data.get("reason") || ""),
      explanation: String(data.get("explanation") || ""),
    });
    const saved = await payload(await api.createAttendanceRequest(body));
    setToast(`Request ${text(saved, "name")} sent to ERP`, "success");
    await refresh();
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Request was not submitted", "danger");
    render("profile");
  }
}

async function start() {
  if (previewMode) {
    if (previewTheme === "light" || previewTheme === "dark") document.documentElement.dataset.theme = previewTheme;
    if (previewScreen === "setup") {
      setup();
      return;
    }
    if (previewScreen === "signin") {
      message = "";
      config = { baseUrl: "https://siezal.aimatic.tech", clientId: "preview", redirectUri: "aimatic-hr://oauth", scope: "all" };
      signIn();
      return;
    }
    seedPreview();
    render(previewScreen);
    return;
  }
  const raw = localStorage.getItem(configKey);
  if (!raw) return setup();
  try {
    await configure((JSON.parse(raw) as OAuthPublicClientConfig).baseUrl);
    if (!await credentials!.getAccessToken()) return signIn();
    await loadContext();
  } catch (error) {
    setup(error instanceof Error ? error.message : "Unable to start");
  }
}

void start();
