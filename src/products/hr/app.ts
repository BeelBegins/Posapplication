import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
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
  isAppBelowMinimum,
  leaveRequest,
} from "./domain";

declare const __APP_VERSION__: string;
type Row = Record<string, unknown>;
type Screen = "home" | "attendance" | "leave" | "pay" | "enroll" | "profile" | "team";
type PreviewScreen = Screen | "setup" | "signin";
type EnrollStep = "pick" | "consent" | "capture" | "review";
type HrApi = ReturnType<typeof createHrApi>;
type Tone = "" | "success" | "warn" | "danger" | "info";

const root = document.querySelector<HTMLElement>("#app")!;
const fetcher = globalThis.fetch.bind(globalThis);
const configKey = "aimatic-hr-config-v1";
/** Production ERP for Aimatic HR; first launch connects here without asking for a URL. */
const DEFAULT_ERP_URL = "https://szl.aimatic.tech";
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
let signInError = "";
let loading = "";
let leaveRows: Row[] = [];
let balances: Row = {};
let payslips: Row[] = [];
let requests: Row = {};
let team: Row[] = [];
let checkins: Row[] = [];
let attendanceTargets: Row[] = [];
let teamCheckins: Row[] = [];
let attendanceTarget = "";
let attendanceQuery = "";
let attendanceBusy = false;
let cameraAttempted = false;
const evidenceCache: Record<string, string> = {};
let evidenceOpen = "";
let evidenceLoading = "";
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
let attendanceCameraPromise: Promise<void> | null = null;
let cameraGeneration = 0;
let backListenerReady = false;
let toastTimer = 0;

const text = (row: Row | undefined, ...keys: string[]) => {
  for (const key of keys) if (row?.[key] != null && row[key] !== "") return String(row[key]);
  return "";
};
const list = (value: unknown): Row[] => Array.isArray(value) ? value.filter((entry): entry is Row => Boolean(entry) && typeof entry === "object") : [];
const money = (value: unknown) => formatMoney(value, "PKR");
const isManager = () => canManageFaceEnrollment(context.roles);
const canMarkOthers = () => isManager() || (Array.isArray(context.roles) && context.roles.some((role) => ["HR Supervisor", "HR User"].includes(String(role))));
const hasEmployee = () => Boolean(text(context, "employee"));
const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "?";

async function payload(response: Response): Promise<Row> {
  const raw = await response.json().catch(() => ({})) as Row;
  const value = (raw.message && typeof raw.message === "object" ? raw.message : raw) as Row;
  if (!response.ok) throw new Error(normalizeErpDisplayText(text(value, "message", "exception") || `Server error ${response.status}`));
  return value;
}

function stopCamera(): void {
  cameraGeneration += 1;
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
  const type = /(?:^|\s)type\s*=/i.test(opts.attrs || "") ? "" : 'type="button"';
  return `<button ${type} class="btn btn-${kind}${opts.block ? " btn-block" : ""}" ${opts.id ? `id="${opts.id}"` : ""} ${opts.disabled ? "disabled" : ""} ${opts.attrs || ""}>${label}</button>`;
}

function field(label: string, control: string): string {
  return `<div class="field"><label>${esc(label)}</label>${control}</div>`;
}

function avatar(name: string): string {
  return `<span class="avatar" aria-hidden="true">${esc(initials(name))}</span>`;
}

function brandMark(): string {
  return `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3.5 4.5 7.2v4.9c0 4.6 3.1 8.8 7.5 10.4 4.4-1.6 7.5-5.8 7.5-10.4V7.2L12 3.5Z" stroke="currentColor" stroke-width="1.8"/><path d="M9.2 12.2h5.6M12 9.4v5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>`;
}

function appBar(subtitle: string, trailing = ""): string {
  return `<header class="app-bar"><div class="brand-lockup">${brandMark()}<div class="brand"><strong>Aimatic HR</strong><small>${esc(subtitle || "Not signed in")}</small></div></div>${trailing}</header>`;
}

/** Valid JPEG data-URL stills for preview/demo; live enroll uses the same canvas path. */
function previewCaptureDataUrl(index: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const gradient = ctx.createLinearGradient(0, 0, 240, 320);
  const tones = ["#0f9f8a", "#1b4664", "#0a7d6c"];
  ctx.fillStyle = tones[index % tones.length];
  ctx.fillRect(0, 0, 240, 320);
  ctx.fillStyle = "#e8fff8";
  ctx.beginPath();
  ctx.ellipse(120, 118, 56, 64, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(120, 250, 84, 74, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#04241e";
  ctx.beginPath();
  ctx.arc(100, 110, 7, 0, Math.PI * 2);
  ctx.arc(140, 110, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#04241e";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(102, 142);
  ctx.quadraticCurveTo(120, 162, 138, 142);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Photo ${index + 1}`, 120, 300);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function isUsableCaptureSrc(src: string): boolean {
  return /^(data:image\/(jpeg|jpg|png|webp|svg\+xml)|blob:|https?:)/i.test(src) && src.length > 40;
}

function enrollmentChip(): string {
  const enrolled = Boolean(context.face_enrolled);
  const pending = /pending/i.test(text(context, "face_enrollment_status", "enrollment_status", "face_status"));
  if (enrolled) return `<span class="chip success">Enrolled</span>`;
  if (pending) return `<span class="chip info">Pending</span>`;
  return `<span class="chip warn">Not enrolled</span>`;
}

function captureThumbs(images: string[]): string {
  if (!images.length) {
    return `<div class="thumbs">${[0, 1, 2].map((i) => `<div class="thumb-placeholder" aria-hidden="true">${icon("camera", 18)}<span>Slot ${i + 1}</span></div>`).join("")}</div>`;
  }
  return `<div class="thumbs">${images.map((image, index) => {
    if (!isUsableCaptureSrc(image)) {
      return `<div class="thumb-wrap"><div class="thumb-placeholder">${icon("alert-circle", 18)}<span>Retake ${index + 1}</span></div><button type="button" class="btn-icon" data-retake="${index}" aria-label="Remove photo ${index + 1}">${icon("x", 16)}</button></div>`;
    }
    // Data URLs must not go through HTML entity escaping — &amp; breaks base64 payloads.
    const safe = image.replace(/"/g, "");
    return `<div class="thumb-wrap"><img class="thumb" alt="Capture ${index + 1}" src="${safe}"><span class="thumb-badge">${index + 1}</span><button type="button" class="btn-icon" data-retake="${index}" aria-label="Remove photo ${index + 1}">${icon("x", 16)}</button></div>`;
  }).join("")}</div>`;
}

async function ensureBackHandler(): Promise<void> {
  if (backListenerReady || previewMode) return;
  backListenerReady = true;
  try {
    await App.addListener("backButton", () => {
      if (cameraOpen || cameraStarting) {
        stopCamera();
        cameraAttempted = true;
        setToast("Camera closed", "warn");
        render(screen === "attendance" ? "attendance" : "enroll");
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
  const url = baseUrl.trim().replace(/\/+$/, "");
  const pub = await payload(await fetcher(`${url}/api/method/aimatichr.hr_mobile.api.get_public_config`, {
    method: "POST",
    headers: { "X-Aimatic-App-Version": __APP_VERSION__ },
  }));
  const minAppVersion = text(pub, "min_app_version");
  // Soft notice only — never block connect/sign-in when a newer build exists.
  if (isAppBelowMinimum(__APP_VERSION__, minAppVersion)) {
    setToast(`A newer Aimatic HR (v${minAppVersion.replace(/^v/i, "")}) is available. You can keep using v${__APP_VERSION__}.`, "warn");
  }
  config = { baseUrl: url, clientId: text(pub, "oauth_client_id"), redirectUri: text(pub, "redirect_uri"), scope: text(pub, "scope") };
  if (!config.clientId || !config.redirectUri) throw new Error("HR OAuth is not configured on this site.");
  localStorage.setItem(configKey, JSON.stringify(config));
  credentials = new OAuthPkceCredentialProvider(async () => config!, androidSecureStorage, capacitorOAuthBrowser, fetcher);
  api = createHrApi(createApiClient({ baseUrl: url, authentication: { mode: "user-session", credentials }, fetch: fetcher }));
}

function setup(error = "", address = "") {
  stopCamera();
  root.innerHTML = `${toastHtml()}<section class="setup"><div class="setup-card">
    <div class="mark">${brandMark()}</div>
    <div class="stack-sm"><p class="t-label">Employee & manager workspace</p><h1 class="t-display">Aimatic HR</h1><p class="t-meta">Connect to your ERP, then sign in with your own account. Attendance, leave and pay stay on the server.</p></div>
    ${error ? `<div class="banner danger">${esc(error)}</div>` : ""}
    <form id="setup" class="stack">
      ${field("ERP URL", `<input id="url" type="url" required placeholder="${esc(DEFAULT_ERP_URL)}" autocomplete="url" value="${esc(address || DEFAULT_ERP_URL)}">`)}
      ${btn("Continue", { kind: "primary", block: true, attrs: 'type="submit"' })}
    </form>
    <p class="t-meta">v${esc(__APP_VERSION__)} · Public OAuth · No API secret</p>
  </div></section>`;
  document.querySelector<HTMLFormElement>("#setup")!.onsubmit = async (event) => {
    event.preventDefault();
    const address = document.querySelector<HTMLInputElement>("#url")!.value.trim();
    const button = document.querySelector<HTMLButtonElement>("#setup button[type=submit]")!;
    button.disabled = true;
    button.textContent = "Connecting…";
    try { await configure(address); signIn(); }
    catch (reason) {
      let host = "";
      try { host = new URL(address).host; } catch { /* browser validation will handle invalid URLs */ }
      const detail = reason instanceof Error ? reason.message : "Connection failed";
      setup(host ? `Connecting to ${host}: ${detail}` : detail, address);
    }
  };
}

function signIn() {
  stopCamera();
  root.innerHTML = `${toastHtml()}<section class="setup"><div class="setup-card">
    <div class="mark">${brandMark()}</div>
    <div class="stack-sm"><p class="t-label">Aimatic HR</p><h1 class="t-display">Sign in</h1><p class="t-meta">Enter your own ERP email and password. Authorized managers can still select employees for attendance.</p></div>
    ${signInError ? `<div class="banner danger" role="alert">${esc(signInError)}</div>` : ""}
    <form id="login-form" class="stack">
      ${field("Email", `<input id="username" type="email" required autocomplete="username" placeholder="you@example.com">`)}
      ${field("Password", `<input id="password" type="password" required autocomplete="current-password" placeholder="ERP password">`)}
      ${btn("Sign in", { kind: "primary", block: true, attrs: 'type="submit"' })}
    </form>
    ${btn("Change ERP server", { id: "change-server", kind: "secondary", block: true })}
  </div></section>`;
  document.querySelector<HTMLFormElement>("#login-form")!.onsubmit = async (event) => {
    event.preventDefault();
    const username = document.querySelector<HTMLInputElement>("#username")!.value;
    const password = document.querySelector<HTMLInputElement>("#password")!.value;
    const button = document.querySelector<HTMLButtonElement>('#login-form button[type="submit"]')!;
    button.disabled = true;
    button.textContent = "Signing in…";
    try {
      signInError = "";
      await credentials!.loginWithPassword(username, password);
      await loadContext();
    } catch (error) {
      signInError = (error instanceof Error ? error.message : "").trim() || "Sign in failed.";
      setToast(signInError, "danger");
      signIn();
    }
  };
  document.querySelector<HTMLButtonElement>("#change-server")!.onclick = () => { localStorage.removeItem(configKey); config = null; signInError = ""; setup(); };
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
  attendanceTargets = directory;
  enrollEmployee = "HR-EMP-00063";
  enrollQuery = "Nabeel";
  enrollConsent = previewScreen === "enroll";
  enrollCaptures = previewScreen === "enroll"
    ? [previewCaptureDataUrl(0), previewCaptureDataUrl(1), previewCaptureDataUrl(2)]
    : [];
  previewUrl = enrollCaptures[enrollCaptures.length - 1] || "";
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
    const tasks: Array<Promise<Row | Row[]>> = [];
    if (hasEmployee()) tasks.push(api.getLeaveSummary().then(payload), api.getPayslips().then(payload), api.getRequests().then(payload), api.getTeam().then(payload), api.getRecentCheckins().then(payload), api.getFormOptions().then(payload));
    if (canMarkOthers()) tasks.push(api.getAttendanceTargets().then(payload), api.getTeamAttendance().then(payload));
    if (isManager()) {
      tasks.push(api.getDirectory(enrollQuery).then(payload));
      tasks.push(api.getFacePolicy().then(payload));
    }
    const results = await Promise.all(tasks);
    let index = 0;
    if (hasEmployee()) {
      const [leave, pay, requestRows, teamRows, logs, formOptions] = results.slice(0, 6) as Row[];
      leaveRows = list(leave.applications); balances = (leave.balances && typeof leave.balances === "object" ? leave.balances : {}) as Row;
      payslips = list(pay); requests = requestRows; team = list(teamRows); checkins = list(logs); options = formOptions; index = 6;
    } else { leaveRows = []; balances = {}; payslips = []; requests = {}; team = []; checkins = []; options = {}; }
    if (canMarkOthers()) { attendanceTargets = list(results[index]); teamCheckins = list(results[index + 1]); if (!attendanceTargets.some((row) => text(row, "name") === attendanceTarget)) attendanceTarget = ""; index += 2; }
    if (isManager()) {
      directory = list(results[index]);
      facePolicy = (results[index + 1] && typeof results[index + 1] === "object" ? results[index + 1] as Row : facePolicy);
    }
    if (!loading) render(screen);
    if (canMarkOthers()) void prefetchEvidenceThumbs();
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Could not refresh HR data", "danger");
    render(screen);
  }
}

function home() {
  if (!hasEmployee()) return `<section class="stack"><article class="card hero-card stack"><p class="t-label">Manager workspace</p><h1 class="t-display">${esc(text(context, "employee_name") || "HR Manager")}</h1><p class="t-meta">Use this shared mobile device to enroll employees and record their attendance.</p></article><div class="qa"><button class="qa-btn" data-screen="team"><strong>Team attendance</strong><span class="t-meta">Last 7 days</span></button><button class="qa-btn" data-screen="attendance"><strong>Mark attendance</strong><span class="t-meta">Live face + GPS</span></button>${isManager() ? `<button class="qa-btn" data-screen="enroll"><strong>Enroll face</strong><span class="t-meta">Employees</span></button>` : ""}</div>${btn(`${icon("log-out", 16)} Sign out`, { id: "sign-out", kind: "danger", block: true })}</section>`;
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
      <div class="row-between">${enrollmentChip()}</div>
      <div class="card-flat hero-attend">
        <p class="t-label">Today’s attendance</p>
        <strong>${latest ? `${esc(text(latest, "log_type"))} · ${esc(text(latest, "time"))}` : "No check-in yet today"}</strong>
      </div>
    </article>
    <div class="qa">
      <button class="qa-btn" data-screen="attendance"><span class="icon">${icon("log-in", 18)}</span><strong>Check in / out</strong><span class="t-meta">Face + GPS</span></button>
      <button class="qa-btn" data-screen="leave"><span class="icon">${icon("calendar", 18)}</span><strong>Request leave</strong><span class="t-meta">Send to ERP</span></button>
      ${canMarkOthers() ? `<button class="qa-btn" data-screen="team"><span class="icon">${icon("users", 18)}</span><strong>Team attendance</strong><span class="t-meta">Location + 7-day evidence</span></button>` : ""}
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
  const filteredTargets = attendanceTargets.filter((row) => `${text(row, "employee_name")} ${text(row, "name")} ${text(row, "department")}`.toLowerCase().includes(attendanceQuery.trim().toLowerCase()));
  const targets = canMarkOthers() ? `<div class="attendance-employee"><label for="attendance-search">Find an employee</label><input id="attendance-search" type="search" autocomplete="off" placeholder="Search by name, ID or department" value="${esc(attendanceQuery)}"><label for="attendance-target">${attendanceTarget ? `Selected: ${esc(text(attendanceTargets.find((row) => text(row, "name") === attendanceTarget), "employee_name") || attendanceTarget)}` : "Choose an employee"}</label><select id="attendance-target" ${filteredTargets.length ? "" : "disabled"}><option value="">${filteredTargets.length ? "Select an employee" : "No matching employees"}</option>${filteredTargets.map((row) => `<option value="${esc(text(row, "name"))}" ${text(row, "name") === attendanceTarget ? "selected" : ""}>${esc(text(row, "employee_name") || text(row, "name"))} · ${esc(text(row, "name"))}</option>`).join("")}</select></div>` : "";
  return `<section class="stack">
    <article class="card stack hr-attendance">
      <p class="t-label">Live attendance</p>
      <h2 class="t-title">Check in or out</h2>
      <p class="t-meta">Look at the live camera, then tap once. The server verifies the face and location.</p>
      ${targets}
      ${cameraOpen ? `<div class="stage attendance-stage"><video id="attendance-video" playsinline muted autoplay></video><div class="oval" aria-hidden="true"></div><div class="stage-meta"><span>Live camera</span><span>Face inside frame</span></div></div>` : `<div class="stage attendance-stage"><div class="stage-meta"><span>${cameraStarting ? "Starting live camera…" : "Camera is off"}</span></div></div>`}
      ${!cameraOpen ? btn(cameraStarting ? "Starting camera…" : "Start live camera", { id: "open-attendance-camera", kind: "secondary", block: true, disabled: cameraStarting }) : ""}
      <div class="grid-2 attendance-actions">
        ${btn(`${icon("log-in", 16)} Check in`, { kind: "primary", block: true, disabled: attendanceBusy, attrs: 'data-log="IN"' })}
        ${btn(`${icon("log-out", 16)} Check out`, { kind: "secondary", block: true, disabled: attendanceBusy, attrs: 'data-log="OUT"' })}
      </div>
    </article>
    <div class="stack-sm"><h3 class="t-subtitle">History</h3>${history}</div>
  </section>`;
}

function checkinDeviceLabel(): string {
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : "web";
  const label = platform === "android" ? "Android" : platform === "ios" ? "iOS" : "Web";
  return `Aimatic HR ${label} ${__APP_VERSION__}`.trim();
}

function evidenceThumb(checkin: string): string {
  const cached = evidenceCache[checkin];
  if (cached) {
    return `<button type="button" class="evidence-thumb-btn" data-evidence="${esc(checkin)}" aria-label="Open check-in photo"><img class="evidence-thumb" alt="" src="${cached}"></button>`;
  }
  if (evidenceLoading === checkin) {
    return `<span class="evidence-thumb evidence-thumb--loading" aria-hidden="true"></span>`;
  }
  return `<button type="button" class="evidence-thumb-btn evidence-thumb-btn--empty" data-evidence="${esc(checkin)}" aria-label="Load check-in photo">${icon("camera", 18)}</button>`;
}

function evidenceLightbox(): string {
  if (!evidenceOpen || !evidenceCache[evidenceOpen]) return "";
  return `<div class="evidence-overlay" role="dialog" aria-modal="true" aria-label="Check-in photo"><div class="evidence-panel"><img class="evidence-full" alt="Attendance evidence" src="${evidenceCache[evidenceOpen]}">${btn("Close", { id: "close-evidence", kind: "secondary", block: true })}</div></div>`;
}

function teamAttendance() {
  const rows = teamCheckins.map((row) => {
    const checkin = text(row, "name");
    const lat = text(row, "latitude"), lng = text(row, "longitude");
    const maps = lat && lng ? `<a class="t-meta" href="https://maps.google.com/?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}" target="_blank" rel="noopener">${esc(lat)}, ${esc(lng)}</a>` : `<span class="t-meta">Location unavailable</span>`;
    const device = text(row, "device_id") || "Unknown device";
    const photo = text(row, "marked_by") ? evidenceThumb(checkin) : `<span class="evidence-thumb evidence-thumb--empty" aria-hidden="true"></span>`;
    return `<article class="list-row">${photo}<div class="grow"><strong>${esc(text(row, "employee_name") || text(row, "employee"))} · ${esc(text(row, "log_type"))}</strong><span class="t-meta">${esc(text(row, "time"))} · ${esc(device)}</span><span class="t-meta">Marked by ${esc(text(row, "marked_by") || "employee/device")}</span>${maps}</div></article>`;
  }).join("");
  return `<section class="stack"><article class="card stack"><p class="t-label">Team attendance</p><h2 class="t-title">Last 7 days</h2><p class="t-meta">Private images are visible to authorized managers for 7 days and then deleted. Tap a photo to open it.</p>${btn(`${icon("refresh", 16)} Refresh`, { id: "refresh-team", kind: "secondary", block: true })}</article>${rows ? `<div class="list">${rows}</div>` : emptyState(icon("users", 28), "No recent team check-ins", "Check-ins from your authorized employees will appear here.")}${evidenceLightbox()}</section>`;
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
          <li>Encrypted face template is stored. Attendance photos are private and kept for up to 7 days; enrollment photos are discarded.</li>
          <li>No commercial face API is used.</li>
          <li>An HR manager can revoke enrollment. Attendance images are automatically deleted after 7 days.</li>
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
        ? `<div class="stage"><img class="preview" alt="Last capture" src="${previewUrl.replace(/"/g, "")}"><div class="oval" aria-hidden="true"></div></div>`
        : `<div class="stage"><div class="stage-meta"><span>Camera closed</span><span>${enrollCaptures.length}/5</span></div></div>`;
    return `<section class="stack">
      ${enrollStepper()}
      <article class="card stack">
        <p class="t-label">Capture</p>
        <h2 class="t-title">Live face photos</h2>
        <p class="t-meta">Center the face in the oval. Face a light source. Avoid backlight. Take 3 to 5 photos.</p>
        <div class="banner">${esc(prompt)}</div>
        ${stage}
        ${captureThumbs(enrollCaptures)}
        <div class="grid-2">
          ${btn(cameraOpen ? "Camera on" : `${icon("camera", 16)} Open camera`, { id: "open-camera", kind: "secondary", block: true, disabled: enrollBusy || enrollCaptures.length >= 5 })}
          ${btn(`Take photo (${enrollCaptures.length}/5)`, { id: "capture-enroll", kind: "primary", block: true, disabled: enrollBusy || !cameraOpen || enrollCaptures.length >= 5 })}
        </div>
        <div class="grid-2">
          ${btn("Remove last", { id: "retake-last", kind: "text", block: true, disabled: !enrollCaptures.length || enrollBusy })}
          ${btn("Clear all", { id: "clear-enroll", kind: "text", block: true, disabled: !enrollCaptures.length || enrollBusy })}
        </div>
        <div class="grid-2">
          ${btn("Back", { id: "enroll-back", kind: "secondary", block: true })}
          ${btn("Review photos", { id: "enroll-next", kind: "primary", block: true, disabled: enrollCaptures.length < 3 })}
        </div>
        ${btn("Close camera", { id: "close-camera", kind: "secondary", block: true, disabled: !(cameraOpen || cameraStarting) })}
      </article>
    </section>`;
  }

  const ready = canSubmitEnrollment({ employee: enrollEmployee, images: enrollCaptures, consent: enrollConsent, busy: enrollBusy });
  return `<section class="stack">
    ${enrollStepper()}
    <article class="card stack">
      <p class="t-label">Review & submit</p>
      <h2 class="t-title">Complete enrollment</h2>
      <div class="list-row">${avatar(text(selected, "employee_name") || enrollEmployee)}<div class="grow"><strong>${esc(text(selected, "employee_name") || enrollEmployee)}</strong><span class="t-meta">${esc(enrollEmployee)} · consent ${esc(policyVersion)} · ${enrollCaptures.length} photos</span></div></div>
      ${captureThumbs(enrollCaptures)}
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
  if (next !== "enroll" && next !== "attendance" && (cameraOpen || cameraStarting)) stopCamera();
  screen = next;
  if (previewMode) document.documentElement.dataset.preview = "1";
  if (previewTheme === "light" || previewTheme === "dark") document.documentElement.dataset.theme = previewTheme;
  document.documentElement.dataset.uiReady = "0";
  if (loading) {
    root.innerHTML = `${toastHtml()}<section class="setup"><div class="setup-card"><p class="t-label">Loading</p><div class="skeleton" aria-busy="true">${loadingSkeleton(4)}</div><p class="t-meta">${esc(loading)}</p></div></section>`;
    return;
  }
  const pages: Record<Screen, () => string> = { home, attendance, leave, pay, enroll, profile, team: teamAttendance };
  // Keep employee navigation at five tabs; unlinked managers get only the areas they can use.
  const employeeNav: Array<{ id: Screen; label: string; icon: string }> = [
    { id: "home", label: "Home", icon: icon("home", 22) },
    { id: "attendance", label: "Attend", icon: icon("map-pin", 22) },
    { id: "leave", label: "Leave", icon: icon("calendar", 22) },
    { id: "pay", label: "Pay", icon: icon("credit-card", 22) },
    { id: "profile", label: "Profile", icon: icon("user", 22) },
  ];
  const managerNav: Array<{ id: Screen; label: string; icon: string }> = [
    { id: "home", label: "Home", icon: icon("home", 22) },
    { id: "attendance", label: "Attend", icon: icon("map-pin", 22) },
    { id: "team", label: "Team", icon: icon("users", 22) },
  ];
  const nav = hasEmployee() ? employeeNav : managerNav;
  if (!isManager() && screen === "enroll") screen = "home";
  if (!hasEmployee() && ["leave", "pay", "profile"].includes(screen)) screen = "home";
  const navActive: Screen = screen === "enroll" ? "profile" : screen;
  root.innerHTML = `${toastHtml()}<section class="shell hr-shell">${appBar(text(context, "employee_name") || "Employee")}<main class="page">${pages[screen]()}</main>${bottomNavigation("HR", navActive, nav)}</section>`;
  bind();
  if ((screen === "enroll" || screen === "attendance") && cameraOpen && activeStream) attachPreview(activeStream);
  if (screen === "attendance" && !cameraOpen && !cameraStarting && !cameraAttempted && !previewMode) {
    cameraAttempted = true;
    void openAttendanceCamera().catch(() => undefined);
  }
  void ensureBackHandler();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { document.documentElement.dataset.uiReady = "1"; });
  });
}

function attachPreview(stream: MediaStream): void {
  const video = document.querySelector<HTMLVideoElement>(screen === "attendance" ? "#attendance-video" : "#enroll-video");
  if (!video) return;
  video.srcObject = stream;
  void video.play().catch(() => setToast("Could not start the live preview.", "danger"));
}

function bind() {
  document.querySelectorAll<HTMLButtonElement>("[data-screen]").forEach((button) => {
    button.onclick = () => {
      setToast("");
      const target = button.dataset.screen as Screen;
      if (target !== screen) { stopCamera(); cameraAttempted = false; attendanceBusy = false; }
      if (target === "enroll") enrollStep = "pick";
      render(target);
    };
  });
  document.querySelector<HTMLButtonElement>("#refresh")?.addEventListener("click", () => void refresh());
  document.querySelector<HTMLButtonElement>("#refresh-team")?.addEventListener("click", () => void refresh());
  document.querySelectorAll<HTMLButtonElement>("[data-log]").forEach((button) => {
    button.onclick = () => void submitLog(button.dataset.log === "OUT" ? "OUT" : "IN");
  });
  document.querySelector<HTMLInputElement>("#attendance-search")?.addEventListener("input", (event) => {
    attendanceQuery = (event.currentTarget as HTMLInputElement).value;
    attendanceTarget = "";
    const select = document.querySelector<HTMLSelectElement>("#attendance-target");
    if (!select) return;
    const filtered = attendanceTargets.filter((row) => `${text(row, "employee_name")} ${text(row, "name")} ${text(row, "department")}`.toLowerCase().includes(attendanceQuery.trim().toLowerCase()));
    select.innerHTML = `<option value="">${filtered.length ? "Select an employee" : "No matching employees"}</option>${filtered.map((row) => `<option value="${esc(text(row, "name"))}">${esc(text(row, "employee_name") || text(row, "name"))} · ${esc(text(row, "name"))}</option>`).join("")}`;
    select.disabled = !filtered.length;
    const label = select.previousElementSibling;
    if (label instanceof HTMLLabelElement) label.textContent = "Choose an employee";
  });
  document.querySelector<HTMLSelectElement>("#attendance-target")?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    attendanceTarget = select.value;
    const label = select.previousElementSibling;
    const employee = attendanceTargets.find((row) => text(row, "name") === attendanceTarget);
    if (label instanceof HTMLLabelElement) label.textContent = employee ? `Selected: ${text(employee, "employee_name") || attendanceTarget}` : "Choose an employee";
  });
  document.querySelector<HTMLButtonElement>("#open-attendance-camera")?.addEventListener("click", () => void openAttendanceCamera().catch(() => undefined));
  document.querySelectorAll<HTMLButtonElement>("[data-evidence]").forEach((button) => button.onclick = () => void openEvidence(button.dataset.evidence || ""));
  document.querySelector<HTMLButtonElement>("#close-evidence")?.addEventListener("click", () => { evidenceOpen = ""; render("team"); });
  document.querySelector(".evidence-overlay")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) { evidenceOpen = ""; render("team"); }
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
    attendanceBusy = false;
    cameraAttempted = false;
    evidenceOpen = "";
    evidenceLoading = "";
    for (const key of Object.keys(evidenceCache)) delete evidenceCache[key];
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
  if (permission.location !== "granted") throw new Error("Precise location permission is required. Enable Location for Aimatic HR in Android Settings, then retry.");
  const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
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

async function captureStillFromStream(prompt: string, videoId = "enroll-video"): Promise<string> {
  if (!activeStream) throw new Error("Open the camera first.");
  const video = document.querySelector<HTMLVideoElement>(`#${videoId}`);
  if (!video) throw new Error("Live preview is not ready yet.");
  const note = document.querySelector("#liveness");
  if (note) note.textContent = prompt;
  if (video.readyState < 2) {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error("Live preview failed.")); };
      const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Live preview did not start. Restart the camera.")); }, 8000);
      const cleanup = () => { window.clearTimeout(timeout); video.removeEventListener("loadeddata", onReady); video.removeEventListener("error", onError); };
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
  if (!api || attendanceBusy || previewMode) {
    if (previewMode) setToast(`Preview ${logType}`, "success");
    return;
  }
  attendanceBusy = true;
  render("attendance");
  try {
    if (offline()) throw new Error("You appear offline. Attendance was not recorded.");
    const employee = canMarkOthers() ? attendanceTarget : text(context, "employee");
    if (!employee) throw new Error("Choose an employee.");
    if (!cameraOpen) await openAttendanceCamera();
    if (!cameraOpen) throw new Error("The camera could not start. Allow camera access and try again.");
    setToast("Getting your location…", "info");
    const challengeReply = await payload(await api.requestCheckinChallenge(employee));
    const challenge = text(challengeReply, "challenge");
    const location = await captureLocation();
    setToast("Capturing face and recording attendance…", "info");
    const image = await captureStillFromStream("Look at the camera", "attendance-video");
    const body: Record<string, unknown> = {
      ...attendanceRequest({ logType, latitude: location.latitude, longitude: location.longitude, challenge, image }),
      employee,
      accuracy: location.accuracy,
      device_id: checkinDeviceLabel(),
    };
    const saved = await payload(await api.submitAttendance(body));
    stopCamera(); previewUrl = ""; cameraAttempted = true;
    setToast(`Recorded ${text(saved, "name")}`, "success"); await refresh();
  } catch (error) {
    setToast(cameraPermissionDeniedMessage(error) || (error instanceof Error ? error.message : "Attendance was not recorded"), "danger");
  } finally {
    attendanceBusy = false;
    render("attendance");
  }
}

function openAttendanceCamera(): Promise<void> {
  if (cameraOpen && activeStream) return Promise.resolve();
  if (attendanceCameraPromise) return attendanceCameraPromise;
  const generation = cameraGeneration;
  attendanceCameraPromise = (async () => {
    try {
      cameraStarting = true;
      if (screen === "attendance") render("attendance");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" }, width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
      if (screen !== "attendance" || generation !== cameraGeneration) { stream.getTracks().forEach((track) => track.stop()); return; }
      activeStream = stream;
      cameraOpen = true; cameraStarting = false;
      render("attendance");
    } catch (error) {
      stopCamera(); cameraAttempted = true;
      setToast(cameraPermissionDeniedMessage(error) || (error instanceof Error ? error.message : "Camera could not start"), "danger");
      if (screen === "attendance") render("attendance");
      throw error;
    } finally {
      cameraStarting = false;
      attendanceCameraPromise = null;
    }
  })();
  return attendanceCameraPromise;
}

async function fetchEvidenceImage(checkin: string): Promise<string> {
  if (evidenceCache[checkin]) return evidenceCache[checkin];
  if (!api) throw new Error("Not signed in");
  const image = text(await payload(await api.getAttendanceEvidence(checkin)), "image");
  if (!image) throw new Error("Image unavailable");
  evidenceCache[checkin] = image;
  return image;
}

async function prefetchEvidenceThumbs() {
  if (!api || previewMode) return;
  const pending = teamCheckins
    .filter((row) => text(row, "marked_by") && text(row, "name") && !evidenceCache[text(row, "name")])
    .map((row) => text(row, "name"))
    .slice(0, 24);
  const queue = [...pending];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const checkin = queue.shift();
      if (!checkin) return;
      try { await fetchEvidenceImage(checkin); }
      catch { /* leave placeholder; tap retries */ }
      if (screen === "team") render("team");
    }
  });
  await Promise.all(workers);
}

async function openEvidence(checkin: string) {
  if (!checkin) return;
  if (evidenceCache[checkin]) { evidenceOpen = checkin; render("team"); return; }
  evidenceLoading = checkin;
  render("team");
  try {
    await fetchEvidenceImage(checkin);
    evidenceOpen = checkin;
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Image unavailable", "danger");
  } finally {
    evidenceLoading = "";
    render("team");
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

function markUiReady(): void {
  document.documentElement.dataset.preview = previewMode ? "1" : "0";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { document.documentElement.dataset.uiReady = "1"; });
  });
}

async function start() {
  if (previewMode) {
    document.documentElement.dataset.preview = "1";
    if (previewTheme === "light" || previewTheme === "dark") document.documentElement.dataset.theme = previewTheme;
    if (previewScreen === "setup") {
      setup();
      markUiReady();
      return;
    }
    if (previewScreen === "signin") {
      message = "";
      signInError = "";
      config = { baseUrl: "https://szl.aimatic.tech", clientId: "preview", redirectUri: "aimatic-hr://oauth", scope: "all" };
      signIn();
      markUiReady();
      return;
    }
    seedPreview();
    render(previewScreen);
    return;
  }
  const raw = localStorage.getItem(configKey);
  if (!raw) {
    try {
      loading = "Connecting to ERP…";
      root.innerHTML = `${toastHtml()}<section class="setup"><div class="setup-card"><p class="t-label">Aimatic HR</p><h1 class="t-display">Connecting…</h1><p class="t-meta">${esc(DEFAULT_ERP_URL)}</p></div></section>`;
      await configure(DEFAULT_ERP_URL);
      return signIn();
    } catch (error) {
      return setup(error instanceof Error ? error.message : "Unable to connect to ERP", DEFAULT_ERP_URL);
    }
  }
  try {
    await configure((JSON.parse(raw) as OAuthPublicClientConfig).baseUrl);
    if (!await credentials!.getAccessToken()) return signIn();
    await loadContext();
  } catch (error) {
    setup(error instanceof Error ? error.message : "Unable to start", DEFAULT_ERP_URL);
  }
}

void start();
