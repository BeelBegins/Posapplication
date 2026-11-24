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
  raceWithTimeout,
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
let enrollPreviewUrl = "";
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
let attendBusy = false;
let attendAbort: AbortController | null = null;
let attendStream: MediaStream | null = null;
// Identity of the submit request currently holding the retry lock (null = no lock). A token,
// not a boolean, so an older request settling late can never release a newer request's lock.
let attendSubmitToken: object | null = null;
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

// Bumped by stopCamera() so a getUserMedia() request that resolves after the employee closed
// the camera or left enrollment is discarded instead of opening a hidden stream.
let enrollCameraGeneration = 0;

function stopCamera(): void {
  enrollCameraGeneration += 1;
  activeStream?.getTracks().forEach((track) => track.stop());
  activeStream = null;
  cameraOpen = false;
  cameraStarting = false;
}

// Cancels an in-flight check-in/out (submitLog). Must run, and release the camera, before any
// navigation tears out #attend-video — called first by both the hardware back handler and the
// [data-screen] click handler. A no-op when no attendance capture is in flight.
function cancelAttend(): void {
  if (!attendBusy) return;
  attendAbort?.abort();
  attendAbort = null;
  attendBusy = false;
  if (attendStream) {
    attendStream.getTracks().forEach((track) => track.stop());
    attendStream = null;
  }
  const video = document.querySelector<HTMLVideoElement>("#attend-video");
  if (video) video.srcObject = null;
  const stage = document.querySelector<HTMLElement>("#attend-stage");
  if (stage) stage.hidden = true;
}

function toastBodyHtml(): string {
  return message ? `<div class="toast ${esc(tone || "info")}" role="status">${esc(message)}</div>` : "";
}

function setToast(next: string, nextTone: Tone = "info"): void {
  message = next;
  tone = nextTone;
  window.clearTimeout(toastTimer);
  // Update the live toast host directly: some callers (e.g. a background preview-recovery
  // fallback) show a toast without a following render(), so the message must appear immediately.
  const host = document.querySelector(".toast-host");
  if (host) host.innerHTML = toastBodyHtml();
  if (next) toastTimer = window.setTimeout(() => { message = ""; tone = ""; const el = document.querySelector(".toast-host"); if (el) el.innerHTML = ""; }, 4200);
}

function toastHtml(): string {
  return `<div class="toast-host" aria-live="polite">${toastBodyHtml()}</div>`;
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
      cancelAttend();
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
  const url = baseUrl.trim().replace(/\/+$/, "");
  const pub = await payload(await fetcher(`${url}/api/method/aimatichr.hr_mobile.api.get_public_config`, { method: "POST" }));
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
    <div class="stack-sm"><p class="t-label">Employee workspace</p><h1 class="t-display">Aimatic HR</h1><p class="t-meta">Connect to your ERP, then sign in with your own employee account. Attendance, leave and pay stay on the server.</p></div>
    ${error ? `<div class="banner danger">${esc(error)}</div>` : ""}
    <form id="setup" class="stack">
      ${field("ERP URL", `<input id="url" type="url" required placeholder="https://erp.example.com" autocomplete="url" value="${esc(address)}">`)}
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
    <div class="stack-sm"><p class="t-label">Aimatic HR</p><h1 class="t-display">Sign in</h1><p class="t-meta">Use your ERP account. The app cannot choose another employee.</p></div>
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
  enrollCaptures = previewScreen === "enroll"
    ? [previewCaptureDataUrl(0), previewCaptureDataUrl(1), previewCaptureDataUrl(2)]
    : [];
  enrollPreviewUrl = enrollCaptures[enrollCaptures.length - 1] || "";
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
      <div class="row-between">${enrollmentChip()}</div>
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
      <div class="stage" id="attend-stage" hidden><video id="attend-video" class="mirror" playsinline muted autoplay></video><div class="oval" aria-hidden="true"></div></div>
      <p class="banner" id="liveness" hidden></p>
      <div class="grid-2">
        ${btn(`${icon("log-in", 16)} Check in`, { kind: "primary", block: true, disabled: attendBusy, attrs: 'data-log="IN"' })}
        ${btn(`${icon("log-out", 16)} Check out`, { kind: "secondary", block: true, disabled: attendBusy, attrs: 'data-log="OUT"' })}
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
      : enrollPreviewUrl
        ? `<div class="stage"><img class="preview" alt="Last capture" src="${enrollPreviewUrl.replace(/"/g, "")}"><div class="oval" aria-hidden="true"></div></div>`
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
  // Navigation during a live check-in/out capture must go through cancelAttend() first (hardware
  // back and [data-screen] clicks both do this) so the camera is released before the DOM
  // attend-video element it's attached to is torn out below. Any other render while the live
  // stream is attached (e.g. a refresh that was already in flight) is skipped; submitLog's
  // finally re-renders once the capture has released the camera.
  if (attendStream) return;
  // While a check-in is in flight only the attendance screen may render; leaving it goes
  // through cancelAttend() first (back button, bottom nav), which clears attendBusy.
  if (attendBusy && next !== "attendance") return;
  if (next !== "enroll" && (cameraOpen || cameraStarting)) stopCamera();
  screen = next;
  if (previewMode) document.documentElement.dataset.preview = "1";
  if (previewTheme === "light" || previewTheme === "dark") document.documentElement.dataset.theme = previewTheme;
  document.documentElement.dataset.uiReady = "0";
  if (loading) {
    root.innerHTML = `${toastHtml()}<section class="setup"><div class="setup-card"><p class="t-label">Loading</p><div class="skeleton" aria-busy="true">${loadingSkeleton(4)}</div><p class="t-meta">${esc(loading)}</p></div></section>`;
    return;
  }
  const pages: Record<Screen, () => string> = { home, attendance, leave, pay, enroll, profile };
  // Exactly 5 tabs — never Enroll in the bar (wraps on ~360px / real phones). Enroll stays manager-only via Home tile + Profile.
  const nav: Array<{ id: Screen; label: string; icon: string }> = [
    { id: "home", label: "Home", icon: icon("home", 22) },
    { id: "attendance", label: "Attend", icon: icon("map-pin", 22) },
    { id: "leave", label: "Leave", icon: icon("calendar", 22) },
    { id: "pay", label: "Pay", icon: icon("credit-card", 22) },
    { id: "profile", label: "Profile", icon: icon("user", 22) },
  ];
  if (!isManager() && screen === "enroll") screen = "home";
  const navActive: Screen = screen === "enroll" ? "profile" : screen;
  // Pull the live enroll video out of the old DOM before it is discarded, so re-rendering the
  // capture step (new photo taken, retake, etc.) doesn't restart/black-flash the camera preview.
  const existingEnrollVideo = screen === "enroll" ? document.querySelector<HTMLVideoElement>("#enroll-video") : null;
  const preservedEnrollVideo = existingEnrollVideo && existingEnrollVideo.srcObject ? existingEnrollVideo : null;
  preservedEnrollVideo?.remove();
  root.innerHTML = `${toastHtml()}<section class="shell">${appBar(text(context, "employee_name") || "Employee")}<main class="page">${pages[screen]()}</main>${bottomNavigation("HR", navActive, nav)}</section>`;
  bind();
  if (screen === "enroll" && cameraOpen && activeStream) {
    const placeholder = document.querySelector<HTMLVideoElement>("#enroll-video");
    if (preservedEnrollVideo && placeholder) {
      placeholder.replaceWith(preservedEnrollVideo);
      void preservedEnrollVideo.play().catch(() => attachPreview(activeStream as MediaStream));
    } else attachPreview(activeStream);
  }
  void ensureBackHandler();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { document.documentElement.dataset.uiReady = "1"; });
  });
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
      cancelAttend();
      if (button.dataset.screen !== "enroll") stopCamera();
      if (button.dataset.screen === "enroll") enrollStep = "pick";
      render(button.dataset.screen as Screen);
    };
  });
  // A manual refresh mid check-in would repaint #attend-video out from under the live capture.
  document.querySelector<HTMLButtonElement>("#refresh")?.addEventListener("click", () => { if (!attendBusy) void refresh(); });
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
    enrollPreviewUrl = enrollCaptures[enrollCaptures.length - 1] || "";
    setToast(enrollCaptures.length ? `Removed last photo. ${enrollCaptures.length}/5 kept.` : "All photos cleared.", "warn");
    render("enroll");
  });
  document.querySelectorAll<HTMLButtonElement>("[data-retake]").forEach((button) => {
    button.onclick = () => {
      const index = Number(button.dataset.retake);
      if (!Number.isInteger(index)) return;
      enrollCaptures = enrollCaptures.filter((_, i) => i !== index);
      enrollPreviewUrl = enrollCaptures[enrollCaptures.length - 1] || "";
      setToast(`Removed photo ${index + 1}.`, "warn");
      render("enroll");
    };
  });
  document.querySelector<HTMLButtonElement>("#clear-enroll")?.addEventListener("click", () => {
    enrollCaptures = [];
    enrollPreviewUrl = "";
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
    if (screen === "enroll") render("enroll");
  }
}

async function captureLocation() {
  let permission = await Geolocation.checkPermissions();
  if (permission.location !== "granted") permission = await Geolocation.requestPermissions({ permissions: ["location"] });
  if (permission.location !== "granted") throw new Error("Precise location permission is required. Enable Location for Aimatic HR in Android Settings, then retry.");
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
  stopCamera();
  cameraStarting = true;
  const generation = enrollCameraGeneration;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "user" }, width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false,
    });
    if (generation !== enrollCameraGeneration || screen !== "enroll") {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    activeStream = stream;
    cameraOpen = true;
    cameraStarting = false;
    setToast(enrollmentPromptForIndex(enrollCaptures.length), "success");
    render("enroll");
  } catch (error) {
    if (generation !== enrollCameraGeneration) return;
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
  enrollPreviewUrl = canvas.toDataURL("image/jpeg", 0.86);
  return enrollPreviewUrl;
}

const attendCancelled = () => new DOMException("Attendance capture was cancelled.", "AbortError");

// Shows a real live preview (visible #attend-video) for the attendance check-in/out capture —
// unlike enrollment, no still image is kept afterward; the frame is sent to the server and discarded.
// `signal` comes from submitLog's AbortController: cancelAttend() aborts it on back/nav so this
// function stops the camera as soon as possible instead of running to completion unseen.
async function captureFace(prompt: string, signal: AbortSignal): Promise<string> {
  // Bounded: a permission prompt that never settles must not keep IN/OUT locked. A stream that
  // arrives after the timeout is stopped straight away.
  let cameraWaitExpired = false;
  const stream = await raceWithTimeout(
    () => navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "user" }, width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false,
    }).then((granted) => {
      if (cameraWaitExpired) granted.getTracks().forEach((track) => track.stop());
      return granted;
    }),
    30_000,
    "The camera did not start. Allow camera access for Aimatic HR, then try again.",
  ).catch((error: unknown) => { cameraWaitExpired = true; throw error; });
  // The permission prompt above can outlast a cancel (back/nav) that already released the UI;
  // getUserMedia must not be left running on a screen the employee has already left.
  if (signal.aborted) { stream.getTracks().forEach((track) => track.stop()); throw attendCancelled(); }
  attendStream = stream;
  // Look the elements up only now: render() is frozen from this point (attendStream is set),
  // so they cannot be replaced by a render that finished during the permission prompt.
  const video = document.querySelector<HTMLVideoElement>("#attend-video");
  const stage = document.querySelector<HTMLElement>("#attend-stage");
  try {
    if (!video || !stage) throw new Error("Live preview is not ready yet.");
    stage.hidden = false;
    video.srcObject = stream;
    await raceWithTimeout(async () => {
      await video.play();
      if (video.readyState < 2) {
        await new Promise<void>((resolve, reject) => {
          const onReady = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error("Live preview failed.")); };
          const cleanup = () => { video.removeEventListener("loadeddata", onReady); video.removeEventListener("error", onError); };
          video.addEventListener("loadeddata", onReady, { once: true });
          video.addEventListener("error", onError, { once: true });
        });
      }
    }, 8000, "Live camera preview did not start in time.");
    if (signal.aborted) throw attendCancelled();
    const note = document.querySelector<HTMLElement>("#liveness");
    if (note) { note.hidden = false; note.textContent = prompt; }
    // Give the employee time to see themselves live and follow the liveness prompt.
    await new Promise((resolve) => window.setTimeout(resolve, 2500));
    if (signal.aborted) throw attendCancelled();
    const canvas = document.createElement("canvas");
    // Native aspect ratio, capped so the JPEG stays well under the server's 2 MB image limit.
    const sourceWidth = video.videoWidth || 480;
    const sourceHeight = video.videoHeight || 640;
    const scale = Math.min(1, 1280 / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    const context2d = canvas.getContext("2d");
    if (!context2d) throw new Error("Camera capture failed.");
    context2d.drawImage(video, 0, 0, canvas.width, canvas.height);
    const quality = frameQualityIssue(canvas);
    if (quality) throw new Error(quality);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
    if (stage) stage.hidden = true;
    if (attendStream === stream) attendStream = null;
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
    enrollPreviewUrl = "";
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
  // Guards the full request, not just the DOM: a refresh/navigation mid-flight can repaint
  // enabled IN/OUT buttons (attendance() only disables them while attendBusy is true), so this
  // flag — not button.disabled — is what stops a second concurrent check-in from starting.
  if (attendBusy) return;
  // A cancelled run may still have its submit request in flight; the server could record it,
  // so a new check-in waits until that request settles (its outcome is still shown as a toast).
  if (attendSubmitToken) { setToast("The previous check-in is still being sent (this can take up to 2 minutes). Check History, then try again.", "warn"); return; }
  const controller = new AbortController();
  attendBusy = true;
  attendAbort = controller;
  const signal = controller.signal;
  setToast("Requesting a server challenge", "info");
  render("attendance");
  let submitStarted = false;
  try {
    if (offline()) throw new Error("You appear offline. Attendance was not recorded.");
    const challengeApi = api;
    const challenge = text(await raceWithTimeout(
      async () => payload(await challengeApi.requestCheckinChallenge()),
      20_000,
      "No reply from the server. Check your connection and try again.",
    ), "challenge");
    if (signal.aborted) return;
    const location = await raceWithTimeout(
      () => captureLocation(),
      45_000,
      "Location did not respond. Turn on Location for Aimatic HR, then try again.",
    );
    if (signal.aborted) return;
    const image = await captureFace(livenessPrompt(challenge), signal);
    if (signal.aborted) return;
    const body = attendanceRequest({ logType, ...location, challenge, image });
    submitStarted = true;
    // The retry lock follows the real request, not the UI wait below, so a punch whose outcome is
    // unknown is not doubled by an immediate retry. It is released early only on a definite answer
    // (a server response); otherwise after 130 s, when the server (gunicorn -t 120, nginx
    // proxy_read_timeout 120) can no longer complete the request, so a retry is safe.
    const submitToken = {};
    attendSubmitToken = submitToken;
    let submitHold = 0;
    const releaseSubmitLock = () => {
      if (attendSubmitToken !== submitToken) return;
      attendSubmitToken = null;
      window.clearTimeout(submitHold);
    };
    submitHold = window.setTimeout(releaseSubmitLock, 130_000);
    const submitApi = api;
    let serverAnswered = false;
    const request = (async () => {
      let response: Response;
      try {
        response = await submitApi.submitAttendance(body);
      } catch {
        throw new Error("The connection dropped while sending. Your punch may have been recorded: check History before trying again.");
      }
      // Only a 2xx/4xx reply is a definite outcome. A 5xx (e.g. a 502/504 from the proxy) may
      // come back after the app already recorded the punch, so the retry lock is kept.
      if (response.status >= 500) {
        throw new Error("The server did not confirm this punch. It may have been recorded: check History before trying again.");
      }
      serverAnswered = true;
      return payload(response);
    })();
    let uiGaveUp = false;
    request.then((row) => {
      releaseSubmitLock();
      if (uiGaveUp) { setToast(`Recorded ${text(row, "name")} (the server replied late)`, "success"); void refresh(); }
    }, () => {
      if (serverAnswered) releaseSubmitLock();
    });
    // The UI wait is bounded so the employee is not left on a spinner; the outcome is then unknown.
    const saved = await raceWithTimeout(
      () => request,
      45_000,
      "No reply from the server yet. Your punch may still be recorded: check History before trying again.",
    ).catch((error: unknown) => { uiGaveUp = true; throw error; });
    // Once the request was sent, its outcome is shown even if the employee navigated away.
    setToast(`Recorded ${text(saved, "name")}`, "success");
    if (signal.aborted) return;
    // Release the check-in lock before refreshing so a slow refresh cannot keep IN/OUT disabled.
    if (attendAbort === controller) { attendBusy = false; attendAbort = null; }
    render("attendance");
    void refresh();
  } catch (error) {
    if (signal.aborted && !submitStarted) return;
    setToast(cameraPermissionDeniedMessage(error) || (error instanceof Error ? error.message : "Attendance was not recorded"), "danger");
  } finally {
    // Only act on state we still own — cancelAttend() may already have cleared it (and a new
    // submitLog call may already have installed its own controller) by the time this runs. When
    // we do still own it, re-render so the IN/OUT buttons pick up attendBusy=false: the earlier
    // render("attendance") calls above all happened while still busy, so they left the buttons
    // disabled in the DOM.
    if (attendAbort === controller) {
      attendBusy = false;
      attendAbort = null;
      render("attendance");
    }
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
      config = { baseUrl: "https://siezal.aimatic.tech", clientId: "preview", redirectUri: "aimatic-hr://oauth", scope: "all" };
      signIn();
      markUiReady();
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
