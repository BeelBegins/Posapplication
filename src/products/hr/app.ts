import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
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
  calendarWeeks,
  cameraPermissionDeniedMessage,
  checkinAreaText,
  dayTone,
  formatDateRange,
  formatDateTime,
  formatDay,
  formatMonthOf,
  formatTime,
  statusTone,
  localIsoDate,
  monthLabel,
  shiftMonth,
  type CalendarDay,
  canManageFaceEnrollment,
  canSubmitEnrollment,
  enrollFaceRequest,
  enrollmentPromptForIndex,
  leaveRequest,
  livenessPrompt,
  raceWithTimeout,
} from "./domain";
import {
  PROFILE_FIELDS,
  UPLOAD_ACCEPT,
  advanceBalance,
  advanceRequest,
  approvalAction,
  approvalItems,
  base64FromDataUrl,
  canWithdrawLeave,
  expenseClaimRequest,
  formatBytes,
  formatFullDate,
  profileUpdates,
  safePdfName,
  uploadProblem,
  type ApprovalItem,
} from "./selfservice";

declare const __APP_VERSION__: string;
type Row = Record<string, unknown>;
type Screen = "home" | "attendance" | "calendar" | "leave" | "pay" | "enroll" | "profile" | "approvals" | "expenses" | "notifications" | "editprofile" | "documents";
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
let checkinArea: Row = {};
let calendarMonth = localIsoDate().slice(0, 7);
let calendarReturn: Screen = "attendance";
let calendarData: Row | null = null;
let calendarLoading = false;
let calendarError = "";
let calendarRequest = 0;
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
// Phase 2 self-service state
let approvals: ApprovalItem[] = [];
let expenseClaims: Row[] = [];
let advances: Row[] = [];
let expenseOptions: Row = {};
let expenseTab: "claims" | "advances" = "claims";
let notifications: Row[] = [];
let unreadCount = 0;
let profileData: Row = {};
let documents: Row[] = [];
let ssBusy = "";
// The profile values the edit form was rendered with: changes are computed against what the
// employee saw, so a reload that lands after they started typing can't turn untouched fields into edits.
let profileFormBase: Row = {};

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

function btn(label: string, opts: { id?: string; kind?: "primary" | "secondary" | "text" | "danger" | "danger-text"; block?: boolean; disabled?: boolean; attrs?: string } = {}): string {
  const kind = opts.kind || "primary";
  const typeAttr = /\btype\s*=/.test(opts.attrs || "") ? "" : 'type="button" ';
  return `<button ${typeAttr}class="btn btn-${kind}${opts.block ? " btn-block" : ""}" ${opts.id ? `id="${opts.id}"` : ""} ${opts.disabled ? "disabled" : ""} ${opts.attrs || ""}>${label}</button>`;
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

const screenTitles: Record<Screen, string> = { home: "Home", attendance: "Attendance", calendar: "Attendance calendar", leave: "Leave", pay: "Payslips", enroll: "Face enrollment", profile: "Profile", approvals: "Approvals", expenses: "Expenses & advances", notifications: "Notifications", editprofile: "Edit details", documents: "My documents" };

/** Consistent page header: Home shows the greeting; sub-screens get a back arrow. */
function pageHeader(current: Screen): string {
  if (current === "home") {
    const hour = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const name = text(context, "employee_name") || "Employee";
    return `<header class="page-header home">${avatar(name)}<div class="grow"><p class="ph-kicker">${esc(greet)}</p><h1 class="ph-title">${esc(name.split(/\s+/)[0] || name)}</h1></div><button type="button" class="ph-action bell" data-screen="notifications" aria-label="${unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}">${hrIcon("bell", 20)}${unreadCount ? `<span class="ph-badge">${unreadCount > 99 ? "99+" : unreadCount}</span>` : ""}</button><button type="button" class="ph-action" id="refresh" aria-label="Refresh">${icon("refresh", 20)}</button></header>`;
  }
  const backTargets: Partial<Record<Screen, Screen>> = { enroll: "home", approvals: "home", expenses: "home", notifications: "home", editprofile: "profile", documents: "profile" };
  const back: Screen | null = current === "calendar" ? calendarReturn : backTargets[current] || null;
  return `<header class="page-header">${back ? `<button type="button" class="ph-action" data-screen="${back}" aria-label="Back">${icon("chevron-left", 22)}</button>` : ""}<div class="grow"><h1 class="ph-title">${esc(screenTitles[current])}</h1></div></header>`;
}

const HR_ICONS: Record<string, string> = {
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/>',
  wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 13h2"/><path d="M2 10h20"/><path d="M6 6V4h12v2"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
};
function hrIcon(name: string, size = 24): string {
  const body = HR_ICONS[name];
  if (!body) return icon(name, size);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function sectionTitle(title: string, trailing = ""): string {
  return `<div class="section-title"><h2>${esc(title)}</h2>${trailing}</div>`;
}

function infoRow(label: string, value: string): string {
  return value ? `<div class="info-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>` : "";
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
      if (screen === "calendar") { render(calendarReturn); return; }
      if (screen === "editprofile" || screen === "documents") { render("profile"); return; }
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
  root.innerHTML = `${toastHtml()}<section class="auth">
    <div class="auth-hero">${brandMark()}<h1>Aimatic HR</h1><p>Attendance, leave and pay in one place.</p></div>
    <div class="auth-card">
      <div class="auth-step"><span class="auth-dot active">1</span><span class="auth-line"></span><span class="auth-dot">2</span></div>
      <div class="stack-sm"><h2 class="t-title">Connect to your company</h2><p class="t-meta">Enter the ERP address your HR team gave you. You'll sign in with your own account next.</p></div>
      ${error ? `<div class="banner danger">${esc(error)}</div>` : ""}
      <form id="setup" class="stack">
        ${field("Company ERP address", `<input id="url" type="url" required placeholder="https://yourcompany.aimatic.tech" autocomplete="url" inputmode="url">`)}
        ${btn(`Continue ${icon("chevron-right", 18)}`, { kind: "primary", block: true, attrs: 'type="submit"' })}
      </form>
    </div>
    <p class="auth-foot">${icon("shield", 14)}<span>Secure sign-in · no passwords stored in the app · v${esc(__APP_VERSION__)}</span></p>
  </section>`;
  document.querySelector<HTMLFormElement>("#setup")!.onsubmit = async (event) => {
    event.preventDefault();
    try { await configure(document.querySelector<HTMLInputElement>("#url")!.value); signIn(); }
    catch (reason) { setup(reason instanceof Error ? reason.message : "Connection failed"); }
  };
}

function signIn() {
  stopCamera();
  let host = "";
  try { host = config?.baseUrl ? new URL(config.baseUrl).host : ""; } catch { host = config?.baseUrl || ""; }
  root.innerHTML = `${toastHtml()}<section class="auth">
    <div class="auth-hero">${brandMark()}<h1>Aimatic HR</h1><p>Attendance, leave and pay in one place.</p></div>
    <div class="auth-card">
      <div class="auth-step"><span class="auth-dot done">${icon("check", 12)}</span><span class="auth-line done"></span><span class="auth-dot active">2</span></div>
      <div class="stack-sm"><h2 class="t-title">Sign in</h2><p class="t-meta">Use your own ERP account. Check-ins are always recorded for the signed-in employee.</p></div>
      ${host ? `<div class="server-pill">${icon("check-circle", 16)}<span>Connected to <strong>${esc(host)}</strong></span></div>` : ""}
      ${message ? `<div class="banner danger">${esc(message)}</div>` : ""}
      ${btn(`${icon("log-in", 18)} Sign in with ERP`, { id: "login", kind: "primary", block: true })}
      ${btn("Use a different company", { id: "change-server", kind: "text", block: true })}
    </div>
    <p class="auth-foot">${icon("shield", 14)}<span>You'll finish signing in on your company's page · v${esc(__APP_VERSION__)}</span></p>
  </section>`;
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
    { log_type: "IN", time: `${localIsoDate()} 09:02:11`, shift: "General" },
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
  checkinArea = { enforced: true, required: false, location: { name: "SZL-HO", location_name: "Siezal Head Office", radius_m: 150 } };
  calendarMonth = "2026-11";
  const statuses: Record<number, string> = { 1: "Weekly Off", 2: "Present", 3: "Present", 4: "Present", 5: "Absent", 6: "Present", 7: "Weekly Off", 8: "Weekly Off", 9: "Present", 10: "Half Day", 11: "Present", 12: "On Leave", 13: "Present", 14: "Weekly Off", 15: "Weekly Off", 16: "Present", 17: "Present", 18: "Holiday" };
  const previewDays: Row[] = [];
  for (let dom = 1; dom <= 30; dom += 1) {
    const date = `2026-11-${String(dom).padStart(2, "0")}`;
    const status = statuses[dom] || (dom <= 18 ? "No Record" : (dom % 7 === 0 || dom % 7 === 1 ? "Weekly Off" : "Upcoming"));
    const worked = status === "Present" || status === "Half Day";
    previewDays.push({ date, status, in_time: worked ? `${date}T09:0${dom % 6}:00` : null, out_time: worked ? `${date}T${status === "Half Day" ? "13" : "18"}:1${dom % 6}:00` : null, working_hours: worked ? (status === "Half Day" ? 4 : 9) : null, late_entry: dom === 9, early_exit: false, leave_type: status === "On Leave" ? "Casual Leave" : null });
  }
  approvals = approvalItems({
    leave: [{ name: "HR-LAP-2026-00041", employee_name: "Sara Khan", leave_type: "Annual Leave", status: "Open", from_date: "2026-11-24", to_date: "2026-11-26", total_leave_days: 3 }],
    expenses: [{ name: "HR-EXP-2026-00017", employee_name: "Bilal Ahmed", expense_type: "Travel", approval_status: "Draft", posting_date: "2026-11-18", total_claimed_amount: 7450, currency: "PKR", total_expenses: 2 }],
    shifts: [{ name: "HR-SHR-2026-00008", employee_name: "Sara Khan", shift_type: "Evening", status: "Draft", from_date: "2026-11-30", to_date: "2026-12-04" }],
  });
  expenseClaims = [
    { name: "HR-EXP-2026-00015", expense_type: "Fuel", posting_date: "2026-11-12", total_claimed_amount: 3200, currency: "PKR", approval_status: "Approved", status: "Paid" },
    { name: "HR-EXP-2026-00016", expense_type: "Meals", posting_date: "2026-11-17", total_claimed_amount: 1850, currency: "PKR", approval_status: "Draft", status: "Draft" },
  ];
  advances = [{ name: "HR-EAD-2026-00004", purpose: "Lahore site visit", posting_date: "2026-11-05", advance_amount: 20000, paid_amount: 20000, claimed_amount: 12500, return_amount: 0, currency: "PKR", status: "Paid", docstatus: 1 }];
  expenseOptions = { types: [{ name: "Travel" }, { name: "Fuel" }, { name: "Meals" }], currency: "PKR", approver: { expense_approver_name: "Sara Khan" } };
  expenseTab = new URLSearchParams(location.search).get("tab") === "advances" ? "advances" : "claims";
  notifications = [
    { name: "n1", subject: "Your leave HR-LAP-2026-00039 was approved", type: "Alert", document_type: "Leave Application", read: 0, creation: `${localIsoDate()} 08:41:00` },
    { name: "n2", subject: "Salary slip for November is ready", type: "Alert", document_type: "Salary Slip", read: 0, creation: "2026-11-18 17:05:00" },
    { name: "n3", subject: "Sara Khan assigned you an expense claim to review", type: "Assignment", document_type: "Expense Claim", read: 1, creation: "2026-11-17 11:20:00" },
  ];
  unreadCount = 2;
  profileData = { cell_number: "+92 300 1234567", personal_email: "ahmed.n@example.com", current_address: "House 12, Street 4, DHA Phase 5, Lahore", permanent_address: "", person_to_be_contacted: "Ayesha Nabeel", emergency_phone_number: "+92 321 7654321", relation: "Spouse", date_of_joining: "2021-03-01", company_email: "nabeel@aimatic.tech" };
  documents = [
    { name: "f1", file_name: "CNIC-front.jpg", file_size: 412000, creation: "2026-11-10 10:02:00" },
    { name: "f2", file_name: "Degree-certificate.pdf", file_size: 1830000, creation: "2026-11-02 15:44:00" },
  ];
  leaveRows = [{ name: "HR-LAP-2026-00040", leave_type: "Casual Leave", status: "Open", from_date: "2026-11-20", to_date: "2026-11-20" }, { name: "HR-LAP-2026-00031", leave_type: "Annual Leave", status: "Approved", from_date: "2026-10-06", to_date: "2026-10-08", docstatus: 1 }];
  payslips = [{ name: "Sal Slip/HR-EMP-00063/00011", net_pay: 185000, start_date: "2026-11-01", end_date: "2026-11-30" }, { name: "Sal Slip/HR-EMP-00063/00010", net_pay: 182500, start_date: "2026-10-01", end_date: "2026-10-31" }];
  calendarData = { month: "2026-11", days: previewDays, summary: { present: 10, absent: 1, half_day: 1, on_leave: 1, holiday: 1, weekly_off: 6, no_record: 0 } };
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
      // Older servers lack this endpoint: never let it fail the whole refresh.
      // Bounded so a stalled lookup can't hold back the rest of the refresh.
      raceWithTimeout(async () => payload(await api!.getCheckinLocation()), 15_000, "timeout").catch(() => ({})),
    ];
    if (isManager()) {
      tasks.push(api.getDirectory(enrollQuery).then(payload));
      tasks.push(api.getFacePolicy().then(payload));
    }
    const optional = <T,>(task: () => Promise<T>) => raceWithTimeout(task, 15_000, "timeout").catch(() => null);
    const extra = Promise.all([
      optional(async () => payload(await api!.getApprovals())),
      optional(async () => payload(await api!.getExpenses())),
      optional(async () => payload(await api!.getNotifications())),
    ]);
    const results = await Promise.all(tasks);
    const [approvalData, expenseData, notificationData] = await extra;
    if (approvalData) approvals = approvalItems(approvalData);
    if (expenseData) { expenseClaims = list(expenseData.claims); advances = list(expenseData.advances); }
    if (notificationData) { notifications = list(notificationData.items); unreadCount = Number(notificationData.unread) || 0; }
    const [leave, pay, requestRows, teamRows, logs, formOptions, area] = results as Row[];
    checkinArea = area && typeof area === "object" ? area : {};
    leaveRows = list(leave.applications);
    balances = (leave.balances && typeof leave.balances === "object" ? leave.balances : {}) as Row;
    payslips = list(pay);
    requests = requestRows;
    team = list(teamRows);
    checkins = list(logs);
    options = formOptions;
    if (isManager()) {
      directory = list(results[7]);
      facePolicy = (results[8] && typeof results[8] === "object" ? results[8] as Row : facePolicy);
    }
    if (!loading) render(screen);
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Could not refresh HR data", "danger");
    render(screen);
  }
}

function home() {
  const latest = checkins[0];
  // Only today's punches decide the Today card; yesterday's last IN must not suggest "Check out".
  const latestToday = latest && text(latest, "time").slice(0, 10) === localIsoDate() ? latest : undefined;
  const lastIn = Boolean(latestToday) && text(latestToday, "log_type") === "IN";
  const todayMeta = latestToday
    ? `Last ${lastIn ? "check-in" : "check-out"} ${formatTime(text(latestToday, "time"))}`
    : latest ? `Last punch ${formatDateTime(text(latest, "time"))}` : "Your first punch of the day will show here.";
  const todayCard = `<article class="card today-card">
      <div class="today-head"><div><p class="t-label">Today</p><strong class="today-status">${latestToday ? (lastIn ? "Checked in" : "Checked out") : "Not checked in"}</strong><p class="t-meta">${esc(todayMeta)}</p></div>${enrollmentChip()}</div>
      ${btn(`${icon(lastIn ? "log-out" : "log-in", 18)} ${lastIn ? "Check out" : "Check in"}`, { kind: "primary", block: true, attrs: 'data-screen="attendance"' })}
    </article>`;
  const actions: Array<[Screen, string, string, number]> = [["attendance", "map-pin", "Attendance", 0], ["calendar", "calendar", "Calendar", 0], ["leave", "clock", "Leave", 0], ["pay", "credit-card", "Payslips", 0], ["expenses", "receipt", "Expenses", 0], ["approvals", "inbox", "Approvals", approvals.length], ["documents", "file", "Documents", 0], ["editprofile", "edit", "My details", 0]];
  const quick = `<div class="qa-row qa-grid">${actions.map(([id, ic, label, count]) => `<button type="button" class="qa-tile" data-screen="${id}"><span class="qa-icon">${hrIcon(ic, 20)}${count ? `<span class="qa-badge" aria-label="${count} pending">${count}</span>` : ""}</span><span>${esc(label)}</span></button>`).join("")}</div>`;
  const pendingBanner = approvals.length ? `<button type="button" class="list-row nav-row approvals-cta" data-screen="approvals"><span class="row-icon warn">${hrIcon("inbox", 18)}</span><div class="grow"><strong>${approvals.length} request${approvals.length === 1 ? "" : "s"} waiting for you</strong><span class="t-meta">Leave, expenses and shifts you approve</span></div>${icon("chevron-right", 18)}</button>` : "";
  const balanceEntries = Object.entries(balances).slice(0, 4);
  const balanceTiles = balanceEntries.length
    ? `<div class="tiles">${balanceEntries.map(([name, value]) => {
      const row = value && typeof value === "object" ? value as Row : {};
      return `<article class="tile"><strong>${esc(row.balance_leaves ?? "–")}</strong><span>${esc(name)}</span></article>`;
    }).join("")}</div>`
    : `<p class="t-meta">No leave allocated yet.</p>`;
  const recent = checkins.slice(0, 3);
  const activity = recent.length
    ? `<div class="list">${recent.map((row) => checkinRow(row)).join("")}</div>`
    : emptyState(icon("clock", 24), "No activity yet", "Check-ins you make will appear here.");
  return `<section class="stack-lg">
    ${todayCard}
    ${pendingBanner}
    ${quick}
    <div class="stack-sm">${sectionTitle("Leave balance", `<button type="button" class="link" data-screen="leave">Apply</button>`)}${balanceTiles}</div>
    <div class="stack-sm">${sectionTitle("Recent activity", `<button type="button" class="link" data-screen="attendance">See all</button>`)}${activity}</div>
  </section>`;
}

function checkinRow(row: Row): string {
  const out = text(row, "log_type") === "OUT";
  return `<article class="list-row"><span class="row-icon ${out ? "out" : "in"}">${icon(out ? "log-out" : "log-in", 18)}</span><div class="grow"><strong>${out ? "Check-out" : "Check-in"}</strong><span class="t-meta">${esc(formatDay(text(row, "time")))}</span></div><span class="row-trail">${esc(formatTime(text(row, "time")))}${text(row, "shift") ? `<small>${esc(text(row, "shift"))}</small>` : ""}</span></article>`;
}

function attendance() {
  const history = checkins.length
    ? `<div class="list">${checkins.map((row) => checkinRow(row)).join("")}</div>`
    : emptyState(icon("clock", 24), "No recent check-ins", "Successful check-ins from ERP will appear here.");
  return `<section class="stack">
    <article class="card stack">
      <div class="card-head"><span class="row-icon in">${icon("camera", 18)}</span><div class="grow"><h2 class="t-title">Face check-in</h2><p class="t-meta">Look at the camera when it opens. Time and face match are checked by the server.</p></div></div>
      <div class="banner info area-banner">${icon("map-pin", 16)}<span>${esc(checkinAreaText(checkinArea))}</span></div>
      <div class="stage" id="attend-stage" hidden><video id="attend-video" class="mirror" playsinline muted autoplay></video><div class="oval" aria-hidden="true"></div></div>
      <p class="banner" id="liveness" hidden></p>
      <div class="grid-2">
        ${btn(`${icon("log-in", 16)} Check in`, { kind: "primary", block: true, disabled: attendBusy, attrs: 'data-log="IN"' })}
        ${btn(`${icon("log-out", 16)} Check out`, { kind: "secondary", block: true, disabled: attendBusy, attrs: 'data-log="OUT"' })}
      </div>
    </article>
    <button type="button" class="list-row nav-row" data-screen="calendar"><span class="row-icon">${icon("calendar", 18)}</span><div class="grow"><strong>Attendance calendar</strong><span class="t-meta">Present, absent, leave and holidays by month</span></div>${icon("chevron-right", 18)}</button>
    <div class="stack-sm">${sectionTitle("History")}${history}</div>
  </section>`;
}

function hhmm(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const match = /T?(\d{2}:\d{2})/.exec(raw.includes("T") ? raw.split("T")[1] : raw.split(" ")[1] || "");
  return match ? match[1] : "";
}

const calendarLegend: Array<[string, string]> = [["present", "Present"], ["absent", "Absent"], ["half", "Half day"], ["leave", "Leave"], ["holiday", "Holiday"], ["off", "Weekly off"]];

function calendarScreen() {
  const days = (calendarData && Array.isArray(calendarData.days) ? calendarData.days : []) as CalendarDay[];
  const summary = (calendarData && calendarData.summary && typeof calendarData.summary === "object" ? calendarData.summary : {}) as Row;
  const today = localIsoDate();
  const weeks = calendarWeeks(calendarMonth, days);
  const grid = `<div class="cal-grid" role="grid" aria-label="${esc(monthLabel(calendarMonth))}">
    ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => `<span class="cal-head" role="columnheader">${name}</span>`).join("")}
    ${weeks.flat().map((cell) => {
      if (!cell.dayOfMonth) return `<span class="cal-cell empty" aria-hidden="true"></span>`;
      const day = cell.day;
      const toneName = day ? dayTone(day.status) : "none";
      const isToday = day?.date === today;
      const flags = day && (day.late_entry || day.early_exit) ? `<i class="cal-flag" title="${day.late_entry ? "Late entry" : "Early exit"}"></i>` : "";
      return `<button type="button" class="cal-cell tone-${toneName}${isToday ? " today" : ""}" data-cal-day="${esc(day?.date || "")}" aria-label="${esc(`${cell.dayOfMonth}: ${day?.status || "No record"}`)}"><span>${cell.dayOfMonth}</span>${flags}</button>`;
    }).join("")}
  </div>`;
  const stat = (label: string, key: string) => `<article class="card-flat cal-stat"><strong class="t-subtitle">${esc(String(summary[key] ?? 0))}</strong><p class="t-meta">${esc(label)}</p></article>`;
  const recent = days.filter((day) => day.date <= today && (day.in_time || day.out_time || !["No Record", "Upcoming", "Weekly Off"].includes(day.status))).slice(-31).reverse();
  const rows = recent.length
    ? `<div class="list">${recent.map((day) => `<article class="list-row"><span class="cal-dot tone-${dayTone(day.status)}" aria-hidden="true"></span><div class="grow"><strong>${esc(formatDay(day.date))}</strong><span class="t-meta">${esc([day.status, day.leave_type, hhmm(day.in_time) && `In ${hhmm(day.in_time)}`, hhmm(day.out_time) && `Out ${hhmm(day.out_time)}`, day.working_hours ? `${Number(day.working_hours).toFixed(1)} h` : "", day.late_entry ? "Late" : "", day.early_exit ? "Early exit" : ""].filter(Boolean).join(" · "))}</span></div></article>`).join("")}</div>`
    : emptyState(icon("calendar", 28), "Nothing recorded yet", "Attendance, leave and holidays for this month will appear here.");
  return `<section class="stack">
    <article class="card stack">
      <div class="row-between cal-nav">
        <button type="button" class="ph-action" id="cal-prev" aria-label="Previous month">${icon("chevron-left", 20)}</button>
        <h2 class="t-title">${esc(monthLabel(calendarMonth))}</h2>
        <button type="button" class="ph-action" id="cal-next" aria-label="Next month">${icon("chevron-right", 20)}</button>
      </div>
      ${calendarError ? `<div class="banner danger">${esc(calendarError)}</div>` : ""}
      ${calendarLoading && !calendarData ? `<div class="skeleton" aria-busy="true">${loadingSkeleton(3)}</div>` : grid}
      <div class="cal-legend">${calendarLegend.map(([toneName, label]) => `<span><i class="cal-dot tone-${toneName}"></i>${esc(label)}</span>`).join("")}</div>
    </article>
    <div class="grid-3">${stat("Present", "present")}${stat("Absent", "absent")}${stat("Leave", "on_leave")}</div>
    <div class="stack-sm">${sectionTitle("Days")}${rows}</div>
  </section>`;
}

async function loadCalendar(month: string): Promise<void> {
  calendarMonth = month;
  if (previewMode || !api) { render("calendar"); return; }
  const ticket = ++calendarRequest;
  calendarLoading = true;
  calendarError = "";
  calendarData = null;
  render("calendar");
  try {
    const data = await raceWithTimeout(async () => payload(await api!.getAttendanceCalendar(month)), 30_000, "The calendar did not load. Check your connection and try again.");
    if (ticket !== calendarRequest) return;
    calendarData = data;
  } catch (error) {
    if (ticket !== calendarRequest) return;
    calendarError = error instanceof Error ? error.message : "Could not load the calendar.";
  } finally {
    if (ticket === calendarRequest) {
      calendarLoading = false;
      if (screen === "calendar") render("calendar");
    }
  }
}

function leave() {
  const typeOptions = (Array.isArray(options.leave_types) ? options.leave_types : []).map((entry) => `<option>${esc(String(entry))}</option>`).join("");
  const balanceEntries = Object.entries(balances);
  const tiles = balanceEntries.length
    ? `<div class="tiles">${balanceEntries.map(([name, value]) => {
      const row = value && typeof value === "object" ? value as Row : {};
      return `<article class="tile"><strong>${esc(row.balance_leaves ?? "–")}</strong><span>${esc(name)}</span></article>`;
    }).join("")}</div>`
    : `<p class="t-meta">No leave allocated yet.</p>`;
  const rows = leaveRows.length
    ? `<div class="list">${leaveRows.map((row) => {
      const status = text(row, "status") || "Open";
      const withdraw = canWithdrawLeave(row) ? `<button type="button" class="link danger" data-withdraw="${esc(text(row, "name"))}" ${ssBusy ? "disabled" : ""}>Withdraw</button>` : "";
      return `<article class="list-row"><span class="row-icon">${icon("calendar", 18)}</span><div class="grow"><strong>${esc(text(row, "leave_type"))}</strong><span class="t-meta">${esc(formatDateRange(text(row, "from_date"), text(row, "to_date")))}</span></div><div class="row-trail-stack">${statusBadge(status, statusTone(status))}${withdraw}</div></article>`;
    }).join("")}</div>`
    : emptyState(icon("calendar", 24), "No leave applications", "Leave you apply for will show here with its status.");
  return `<section class="stack-lg">
    <div class="stack-sm">${sectionTitle("Balance")}${tiles}</div>
    <form id="leave" class="card stack">
      <h2 class="t-title">Apply for leave</h2>
      ${field("Leave type", `<select name="leaveType" required>${typeOptions || "<option value=''>No allocated leave</option>"}</select>`)}
      <div class="grid-2">
        ${field("From", `<input name="fromDate" type="date" required>`)}
        ${field("To", `<input name="toDate" type="date" required>`)}
      </div>
      ${field("Reason", `<textarea name="description" placeholder="Optional note for your approver"></textarea>`)}
      ${btn("Submit application", { kind: "primary", block: true, attrs: 'type="submit"' })}
    </form>
    <div class="stack-sm">${sectionTitle("My applications")}${rows}</div>
  </section>`;
}

function pay() {
  if (!payslips.length) return emptyState(icon("credit-card", 24), "No payslips yet", "Your salary slips will appear here once payroll is posted.");
  const latest = payslips[0];
  return `<section class="stack-lg">
    <article class="card pay-hero"><p class="t-label">Latest net pay</p><strong class="pay-amount">${esc(money(latest.net_pay))}</strong><p class="t-meta">${esc(formatMonthOf(text(latest, "start_date")) || text(latest, "name"))}</p></article>
    <div class="stack-sm">${sectionTitle("All payslips")}<div class="list">${payslips.map((row) => `<article class="list-row pay-row"><span class="row-icon">${icon("credit-card", 18)}</span><div class="grow"><strong>${esc(formatMonthOf(text(row, "start_date")) || text(row, "name"))}</strong><span class="t-meta">${esc(formatDateRange(text(row, "start_date"), text(row, "end_date")))}</span></div><span class="row-trail pay-trail"><b>${esc(money(row.net_pay))}</b></span><button type="button" class="icon-btn" data-payslip="${esc(text(row, "name"))}" aria-label="${esc(`Download payslip ${formatMonthOf(text(row, "start_date")) || text(row, "name")}`)}" ${ssBusy ? "disabled" : ""}>${hrIcon("download", 18)}</button></article>`).join("")}</div></div>
  </section>`;
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
      <div class="stack-sm"><h2 class="t-title">Who are you enrolling?</h2><p class="t-meta">Finishing this also completes any Pending enrollment for the same person.</p></div>
      <form id="enroll-search" class="search-bar">
        <span class="search-icon" aria-hidden="true">${icon("search", 18)}</span>
        <input id="enroll-query" value="${esc(enrollQuery)}" placeholder="Search name, code or department" autocomplete="off" aria-label="Search employees">
        <button type="submit" class="btn btn-secondary search-go" ${enrollSearching || enrollBusy ? "disabled" : ""}>${enrollSearching ? "…" : "Search"}</button>
      </form>
      ${picks ? `<div class="list">${picks}</div>` : emptyState(icon("users", 24), "No employees found", "Search the directory, then pick who to enroll.")}
      <div class="sticky-actions">
        ${selected ? `<p class="t-meta">Selected <strong>${esc(text(selected, "employee_name"))}</strong> · ${esc(text(selected, "name"))}</p>` : `<p class="t-meta">Pick an employee to continue.</p>`}
        ${btn(`Continue ${icon("chevron-right", 18)}`, { id: "enroll-next", kind: "primary", block: true, disabled: !enrollEmployee })}
      </div>
    </section>`;
  }

  if (enrollStep === "consent") {
    return `<section class="stack">
      ${enrollStepper()}
      <article class="card stack">
        <div class="card-head"><span class="row-icon in">${icon("shield", 18)}</span><div class="grow"><h2 class="t-title">Employee consent</h2><p class="t-meta">Used only for attendance check-in and check-out · policy ${esc(policyVersion)}</p></div></div>
        <ul class="t-meta bullet-list">
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
          ${btn("Continue", { id: "enroll-next", kind: "primary", block: true, disabled: !enrollConsent })}
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
        <div class="row-between"><h2 class="t-title">Live face photos</h2><span class="chip ${enrollCaptures.length >= 3 ? "success" : "info"}">${enrollCaptures.length}/5</span></div>
        <p class="t-meta">Face a light source, keep the face inside the oval, and take 3 to 5 photos.</p>
        ${stage}
        <div class="prompt-pill">${icon("alert-circle", 16)}<span>${esc(prompt)}</span></div>
        <div class="capture-bar">
          ${btn(cameraOpen || cameraStarting ? `${icon("x", 16)} Close` : `${icon("camera", 16)} Open camera`, { id: cameraOpen || cameraStarting ? "close-camera" : "open-camera", kind: "secondary", disabled: enrollBusy || (!(cameraOpen || cameraStarting) && enrollCaptures.length >= 5) })}
          ${btn(`${icon("camera", 18)} Take photo`, { id: "capture-enroll", kind: "primary", disabled: enrollBusy || !cameraOpen || enrollCaptures.length >= 5 })}
        </div>
        ${captureThumbs(enrollCaptures)}
        <div class="grid-2">
          ${btn("Remove last", { id: "retake-last", kind: "text", block: true, disabled: !enrollCaptures.length || enrollBusy })}
          ${btn("Clear all", { id: "clear-enroll", kind: "text", block: true, disabled: !enrollCaptures.length || enrollBusy })}
        </div>
      </article>
      <div class="grid-2">
        ${btn("Back", { id: "enroll-back", kind: "secondary", block: true })}
        ${btn(`Review ${icon("chevron-right", 18)}`, { id: "enroll-next", kind: "primary", block: true, disabled: enrollCaptures.length < 3 })}
      </div>
    </section>`;
  }

  const ready = canSubmitEnrollment({ employee: enrollEmployee, images: enrollCaptures, consent: enrollConsent, busy: enrollBusy });
  return `<section class="stack">
    ${enrollStepper()}
    <article class="card stack">
      <h2 class="t-title">Review and submit</h2>
      <div class="list-row">${avatar(text(selected, "employee_name") || enrollEmployee)}<div class="grow"><strong>${esc(text(selected, "employee_name") || enrollEmployee)}</strong><span class="t-meta">${esc(enrollEmployee)} · consent ${esc(policyVersion)} · ${enrollCaptures.length} photos</span></div></div>
      ${captureThumbs(enrollCaptures)}
      <div class="banner">Submitting creates or updates this employee\u2019s face enrollment, including any Pending record.</div>
      <div class="grid-2">
        ${btn("Back to capture", { id: "enroll-back", kind: "secondary", block: true, disabled: enrollBusy })}
        ${btn(enrollBusy ? "Enrolling…" : "Submit enrollment", { id: "submit-enroll", kind: "primary", block: true, disabled: !ready })}
      </div>
    </article>
  </section>`;
}

function profile() {
  const name = text(context, "employee_name") || "Employee";
  const requestTiles = [["attendance", "Attendance"], ["expenses", "Expenses"], ["shifts", "Shifts"]].map(([key, label]) => `<article class="tile"><strong>${list(requests[key]).length}</strong><span>${esc(label)}</span></article>`).join("");
  return `<section class="stack-lg">
    <article class="card profile-card">
      <span class="avatar xl" aria-hidden="true">${esc(initials(name))}</span>
      <h2 class="t-title">${esc(name)}</h2>
      <p class="t-meta">${esc(text(context, "designation") || "Employee")}</p>
      ${enrollmentChip()}
    </article>
    <div class="card info-card">
      ${infoRow("Employee ID", text(context, "employee"))}
      ${infoRow("Department", text(context, "department"))}
      ${infoRow("Company", text(context, "company"))}
    </div>
    <div class="list">
      <button type="button" class="list-row nav-row" data-screen="editprofile"><span class="row-icon">${hrIcon("edit", 18)}</span><div class="grow"><strong>My details</strong><span class="t-meta">Phone, personal email, address, emergency contact</span></div>${icon("chevron-right", 18)}</button>
      <button type="button" class="list-row nav-row" data-screen="documents"><span class="row-icon">${hrIcon("file", 18)}</span><div class="grow"><strong>My documents</strong><span class="t-meta">Upload CNIC, certificates and other papers</span></div>${icon("chevron-right", 18)}</button>
    </div>
    <div class="stack-sm">${sectionTitle("Open requests")}<div class="tiles">${requestTiles}</div></div>
    <div class="stack-sm">${sectionTitle("My team")}${team.length ? `<div class="list">${team.map((row) => `<article class="list-row">${avatar(text(row, "employee_name"))}<div class="grow"><strong>${esc(text(row, "employee_name"))}</strong><span class="t-meta">${esc(text(row, "designation") || text(row, "department"))}</span></div></article>`).join("")}</div>` : emptyState(icon("users", 24), "No direct reports", "People who report to you will appear here.")}</div>
    <form id="correction" class="card stack">
      <h2 class="t-title">Attendance request</h2>
      <p class="t-meta">For days you worked from home or on duty away from your site.</p>
      ${field("Reason", `<select name="reason"><option>Work From Home</option><option>On Duty</option></select>`)}
      <div class="grid-2">${field("From", `<input name="fromDate" type="date" required>`)}${field("To", `<input name="toDate" type="date" required>`)}</div>
      ${field("Explanation", `<textarea name="explanation" placeholder="What happened?"></textarea>`)}
      ${btn("Send request", { kind: "primary", block: true, attrs: 'type="submit"' })}
    </form>
    ${isManager() ? `<button type="button" class="list-row nav-row" data-screen="enroll"><span class="row-icon">${icon("camera", 18)}</span><div class="grow"><strong>Face enrollment</strong><span class="t-meta">Enroll or re-enroll an employee</span></div>${icon("chevron-right", 18)}</button>` : ""}
    ${btn(`${icon("log-out", 16)} Sign out`, { id: "sign-out", kind: "danger-text", block: true })}
    <p class="t-meta center">Aimatic HR v${esc(__APP_VERSION__)}</p>
  </section>`;
}

function approvalsScreen() {
  if (!approvals.length) return emptyState(hrIcon("inbox", 26), "Nothing to approve", "Leave, expense and shift requests sent to you will appear here.");
  const groups: Array<[string, string]> = [["Leave Application", "Leave"], ["Expense Claim", "Expenses"], ["Shift Request", "Shifts"]];
  return `<section class="stack-lg">${groups.map(([doctype, label]) => {
    const items = approvals.filter((item) => item.doctype === doctype);
    if (!items.length) return "";
    return `<div class="stack-sm">${sectionTitle(label, `<span class="count-pill">${items.length}</span>`)}${items.map((item) => {
      const when = item.to ? formatDateRange(item.from, item.to) : formatDay(item.from);
      const amount = item.amount ? `<strong class="approval-amount">${esc(formatMoney(item.amount, item.currency || "PKR"))}</strong>` : "";
      const key = `${esc(item.doctype)}|${esc(item.name)}`;
      return `<article class="card approval-card">
        <div class="card-head">${avatar(item.employee)}<div class="grow"><strong>${esc(item.employee || "Employee")}</strong><span class="t-meta">${esc([item.title, item.detail].filter(Boolean).join(" · "))}</span></div>${amount}</div>
        <p class="t-meta approval-when">${icon("calendar", 14)} ${esc(when)} <span class="muted">· ${esc(item.name)}</span></p>
        <div class="grid-2">${btn(`${icon("x", 16)} Reject`, { kind: "secondary", block: true, disabled: Boolean(ssBusy), attrs: `data-approval="${key}" data-decision="reject"` })}${btn(`${icon("check", 16)} Approve`, { kind: "primary", block: true, disabled: Boolean(ssBusy), attrs: `data-approval="${key}" data-decision="approve"` })}</div>
      </article>`;
    }).join("")}</div>`;
  }).join("")}</section>`;
}

function expensesScreen() {
  const currency = text(expenseOptions, "currency") || "PKR";
  const tabs = `<div class="segmented" role="tablist">${(["claims", "advances"] as const).map((id) => `<button type="button" role="tab" class="seg${expenseTab === id ? " active" : ""}" data-exp-tab="${id}" aria-selected="${expenseTab === id}">${id === "claims" ? "Claims" : "Advances"}</button>`).join("")}</div>`;
  if (expenseTab === "advances") {
    const outstanding = advances.reduce((sum, row) => sum + advanceBalance(row), 0);
    const rowsHtml = advances.length
      ? `<div class="list">${advances.map((row) => { const status = text(row, "status") || "Draft"; return `<article class="list-row"><span class="row-icon">${hrIcon("wallet", 18)}</span><div class="grow"><strong>${esc(text(row, "purpose") || text(row, "name"))}</strong><span class="t-meta">${esc(formatDay(text(row, "posting_date")))} · ${esc(formatMoney(row.advance_amount, text(row, "currency") || currency))}</span></div><div class="row-trail-stack">${statusBadge(status, statusTone(status))}<small class="t-meta">Bal ${esc(formatMoney(advanceBalance(row), text(row, "currency") || currency))}</small></div></article>`; }).join("")}</div>`
      : emptyState(hrIcon("wallet", 24), "No advances", "Advances you request will appear here.");
    return `<section class="stack-lg">${tabs}
      <article class="card stat-hero"><p class="t-label">Outstanding advance</p><strong class="pay-amount">${esc(formatMoney(outstanding, currency))}</strong><p class="t-meta">Paid to you and not yet claimed or returned</p></article>
      <form id="advance-form" class="card stack">
        <h2 class="t-title">Request an advance</h2>
        ${field("Purpose", `<textarea name="purpose" required placeholder="e.g. Travel to Karachi branch"></textarea>`)}
        ${field(`Amount (${currency})`, `<input name="amount" type="number" inputmode="decimal" min="1" step="0.01" required>`)}
        ${btn("Send request", { kind: "primary", block: true, disabled: Boolean(ssBusy), attrs: 'type="submit"' })}
      </form>
      <div class="stack-sm">${sectionTitle("My advances")}${rowsHtml}</div>
    </section>`;
  }
  const types = list(expenseOptions.types).map((row) => `<option>${esc(text(row, "name"))}</option>`).join("");
  const approverName = text((expenseOptions.approver || {}) as Row, "expense_approver_name");
  const pending = expenseClaims.filter((row) => text(row, "approval_status") === "Draft").reduce((sum, row) => sum + (Number(row.total_claimed_amount) || 0), 0);
  const rowsHtml = expenseClaims.length
    ? `<div class="list">${expenseClaims.map((row) => { const status = text(row, "approval_status") === "Draft" ? "Pending" : text(row, "status") || text(row, "approval_status"); return `<article class="list-row"><span class="row-icon">${hrIcon("receipt", 18)}</span><div class="grow"><strong>${esc(text(row, "expense_type") || "Expense")}</strong><span class="t-meta">${esc(formatDay(text(row, "posting_date")))} · ${esc(text(row, "name"))}</span></div><div class="row-trail-stack"><b>${esc(formatMoney(row.total_claimed_amount, text(row, "currency") || currency))}</b>${statusBadge(status, statusTone(status))}</div></article>`; }).join("")}</div>`
    : emptyState(hrIcon("receipt", 24), "No expense claims", "Claims you submit will appear here with their status.");
  return `<section class="stack-lg">${tabs}
    <article class="card stat-hero"><p class="t-label">Waiting for approval</p><strong class="pay-amount">${esc(formatMoney(pending, currency))}</strong><p class="t-meta">${approverName ? `Approver: ${esc(approverName)}` : "Sent to your expense approver"}</p></article>
    <form id="expense-form" class="card stack">
      <h2 class="t-title">New expense claim</h2>
      <div class="grid-2">${field("Date", `<input name="expenseDate" type="date" max="${localIsoDate()}" value="${localIsoDate()}" required>`)}${field(`Amount (${currency})`, `<input name="amount" type="number" inputmode="decimal" min="1" step="0.01" required>`)}</div>
      ${field("Type", `<select name="expenseType" required>${types || "<option value=''>No expense types set up</option>"}</select>`)}
      ${field("Description", `<textarea name="description" placeholder="What was it for?"></textarea>`)}
      ${field("Receipt (optional)", `<input name="receipt" type="file" accept="${UPLOAD_ACCEPT}" capture="environment">`)}
      ${btn("Submit claim", { kind: "primary", block: true, disabled: Boolean(ssBusy), attrs: 'type="submit"' })}
    </form>
    <div class="stack-sm">${sectionTitle("My claims")}${rowsHtml}</div>
  </section>`;
}

function notificationsScreen() {
  if (!notifications.length) return emptyState(hrIcon("bell", 26), "You're all caught up", "Approvals, payslips and HR updates will appear here.");
  return `<section class="stack">
    <div class="row-between">${sectionTitle(unreadCount ? `${unreadCount} unread` : "All read")}${unreadCount ? `<button type="button" class="link" id="mark-all-read" ${ssBusy ? "disabled" : ""}>Mark all read</button>` : ""}</div>
    <div class="list">${notifications.map((row) => {
      const unread = !Number(row.read);
      return `<button type="button" class="list-row notif${unread ? " unread" : ""}" data-notification="${esc(text(row, "name"))}"><span class="row-icon">${hrIcon(text(row, "document_type") === "Salary Slip" ? "credit-card" : text(row, "document_type") === "Expense Claim" ? "receipt" : "bell", 18)}</span><div class="grow"><strong>${esc(text(row, "subject") || "Notification")}</strong><span class="t-meta">${esc(formatDateTime(text(row, "creation")))}${text(row, "document_type") ? ` · ${esc(text(row, "document_type"))}` : ""}</span></div>${unread ? `<i class="unread-dot" aria-label="Unread"></i>` : ""}</button>`;
    }).join("")}</div>
  </section>`;
}

function editProfileScreen() {
  profileFormBase = { ...profileData };
  const control = (key: string, label: string, kind: string) => {
    const value = esc(text(profileData, key));
    const input = kind === "textarea"
      ? `<textarea name="${key}" maxlength="500">${value}</textarea>`
      : `<input name="${key}" type="${kind}" value="${value}" ${kind === "tel" ? 'inputmode="tel" maxlength="21"' : kind === "email" ? 'inputmode="email" maxlength="254"' : 'maxlength="140"'}>`;
    return field(label, input);
  };
  const [contact, address, emergency] = [PROFILE_FIELDS.slice(0, 2), PROFILE_FIELDS.slice(2, 4), PROFILE_FIELDS.slice(4)];
  return `<form id="profile-form" class="stack-lg">
    <div class="card info-card">${infoRow("Work email", text(profileData, "company_email"))}${infoRow("Joined", formatFullDate(text(profileData, "date_of_joining")))}${infoRow("Employee ID", text(context, "employee"))}</div>
    <div class="stack-sm">${sectionTitle("Contact")}<div class="card stack">${contact.map(([k, l, t]) => control(k, l, t)).join("")}</div></div>
    <div class="stack-sm">${sectionTitle("Address")}<div class="card stack">${address.map(([k, l, t]) => control(k, l, t)).join("")}</div></div>
    <div class="stack-sm">${sectionTitle("Emergency contact")}<div class="card stack">${emergency.map(([k, l, t]) => control(k, l, t)).join("")}</div></div>
    <p class="t-meta">Name, job and bank details are managed by HR. Changes here are saved to your ERP employee record.</p>
    <div class="sticky-actions">${btn("Save changes", { kind: "primary", block: true, disabled: Boolean(ssBusy), attrs: 'type="submit"' })}</div>
  </form>`;
}

function documentsScreen() {
  const rowsHtml = documents.length
    ? `<div class="list">${documents.map((row) => `<article class="list-row"><span class="row-icon">${hrIcon("file", 18)}</span><div class="grow"><strong class="ellipsis">${esc(text(row, "file_name"))}</strong><span class="t-meta">${esc(formatDay(text(row, "creation")))} · ${esc(formatBytes(row.file_size))}</span></div>${statusBadge("Private", "neutral")}</article>`).join("")}</div>`
    : emptyState(hrIcon("file", 24), "No documents yet", "Files you upload are stored privately on your employee record.");
  return `<section class="stack-lg">
    <form id="document-form" class="card stack">
      <div class="card-head"><span class="row-icon">${hrIcon("upload", 18)}</span><div class="grow"><h2 class="t-title">Upload a document</h2><p class="t-meta">PDF, JPG or PNG up to 5 MB. Only you and HR can see it.</p></div></div>
      <label class="file-drop"><input name="file" type="file" accept="${UPLOAD_ACCEPT}" required><span>${hrIcon("upload", 20)} Choose file</span></label>
      ${btn("Upload", { kind: "primary", block: true, disabled: Boolean(ssBusy), attrs: 'type="submit"' })}
    </form>
    <div class="stack-sm">${sectionTitle("Uploaded")}${rowsHtml}</div>
  </section>`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(base64FromDataUrl(String(reader.result || "")));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

const SS_CONTROLS = 'main.page button[type="submit"], [data-approval], [data-withdraw], [data-payslip], #mark-all-read, main.page form input, main.page form select, main.page form textarea';
// FormData is always read before runSelfService starts, so disabling the inputs is safe and
// stops edits made during the request from being lost when the success re-render lands.
function setBusyControls(busy: boolean) {
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(SS_CONTROLS).forEach((control) => { control.disabled = busy; });
  document.querySelectorAll<HTMLFormElement>("main.page form").forEach((form) => { if (busy) form.dataset.submitting = "1"; else delete form.dataset.submitting; });
}

/**
 * Runs one self-service action. Controls are disabled in place (no re-render) so a failed
 * validation or request keeps what the employee typed and the file they picked. Only a
 * successful action re-renders, and only the screen it belongs to; if the employee moved to
 * another screen meanwhile, that screen just gets its controls re-enabled.
 */
async function runSelfService(label: string, task: () => Promise<void>, owner: Screen) {
  if (!api || previewMode || ssBusy) return;
  if (offline()) { setToast("You appear offline. Reconnect and try again.", "danger"); return; }
  ssBusy = label;
  setBusyControls(true);
  let ok = false;
  try {
    await task();
    ok = true;
  } catch (error) {
    setToast(error instanceof Error ? error.message : `${label} failed`, "danger");
  } finally {
    ssBusy = "";
    // A form the employee started after leaving and returning (not the one being submitted) is kept.
    const freshEdits = Boolean(document.querySelector("main.page form[data-dirty]:not([data-submitting])"));
    if (ok && screen === owner && !freshEdits) render(owner);
    else setBusyControls(false);
  }
}

/** Best-effort list refresh after a successful create: a failure here must not look like the create failed. */
async function refreshExpenseLists() {
  try {
    const fresh = await payload(await api!.getExpenses());
    expenseClaims = list(fresh.claims); advances = list(fresh.advances);
  } catch { /* the new item appears on the next refresh */ }
}

/** True once the employee has typed into or picked a file in a form on the current page. */
function pageFormDirty(): boolean {
  return Boolean(document.querySelector("main.page form[data-dirty]"));
}

async function openScreenData(next: Screen) {
  if (!api || previewMode) return;
  try {
    if (next === "expenses") {
      const [data, opts] = await Promise.all([api.getExpenses().then(payload), api.getExpenseOptions().then(payload)]);
      expenseClaims = list(data.claims); advances = list(data.advances); expenseOptions = opts;
    } else if (next === "approvals") approvals = approvalItems(await payload(await api.getApprovals()));
    else if (next === "notifications") { const data = await payload(await api.getNotifications()); notifications = list(data.items); unreadCount = Number(data.unread) || 0; }
    else if (next === "editprofile") profileData = ((await payload(await api.getProfile())).profile || {}) as Row;
    else if (next === "documents") documents = list(await payload(await api.getDocuments()));
    else return;
    if (screen !== next) return;
    if (!pageFormDirty()) { render(next); return; }
    // The employee already started typing: keep their input, but still fill in expense types.
    const select = next === "expenses" ? document.querySelector<HTMLSelectElement>('#expense-form select[name="expenseType"]') : null;
    const types = list(expenseOptions.types).map((row) => text(row, "name")).filter(Boolean);
    if (select && types.length && !select.value) {
      select.innerHTML = types.map((name) => `<option>${esc(name)}</option>`).join("");
    }
  } catch (error) {
    if (screen === next) setToast(error instanceof Error ? error.message : "Could not load this page", "danger");
  }
}

function bindSelfService() {
  document.querySelectorAll<HTMLFormElement>("main.page form").forEach((form) => {
    const mark = () => { form.dataset.dirty = "1"; };
    form.addEventListener("input", mark);
    form.addEventListener("change", mark);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-exp-tab]").forEach((button) => {
    button.onclick = () => { expenseTab = button.dataset.expTab === "advances" ? "advances" : "claims"; render("expenses"); };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-approval]").forEach((button) => {
    button.onclick = () => {
      const [doctype, name] = (button.dataset.approval || "").split("|");
      const decision = button.dataset.decision || "";
      let reason = "";
      if (decision === "reject") {
        const answer = window.prompt("Reason for rejecting (optional)", "");
        if (answer === null) return;
        reason = answer;
      }
      void runSelfService("Saving decision", async () => {
        const body = approvalAction(doctype, name, decision, reason);
        await payload(await api!.actOnApproval(body));
        approvals = approvals.filter((item) => !(item.doctype === doctype && item.name === name));
        setToast(`${name} ${decision === "approve" ? "approved" : "rejected"}`, "success");
      }, "approvals");
    };
  });
  document.querySelector<HTMLFormElement>("#expense-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const receipt = data.get("receipt");
    const file = receipt instanceof File && receipt.size ? receipt : null;
    void runSelfService("Submitting claim", async () => {
      const problem = file ? uploadProblem(file) : null;
      if (problem) throw new Error(problem);
      const body = expenseClaimRequest({ expenseDate: String(data.get("expenseDate") || ""), expenseType: String(data.get("expenseType") || ""), amount: String(data.get("amount") || ""), description: String(data.get("description") || ""), today: localIsoDate() });
      const saved = await payload(await api!.createExpenseClaim(body));
      let note = "";
      if (file) {
        try { await payload(await api!.uploadDocument({ doctype: "Expense Claim", name: text(saved, "name"), filename: file.name, content: await readFileAsBase64(file) })); }
        catch { note = " (receipt upload failed — attach it again from ERP)"; }
      }
      setToast(`Claim ${text(saved, "name")} sent for approval${note}`, note ? "warn" : "success");
      await refreshExpenseLists();
    }, "expenses");
  });
  document.querySelector<HTMLFormElement>("#advance-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    void runSelfService("Requesting advance", async () => {
      const body = advanceRequest({ purpose: String(data.get("purpose") || ""), amount: String(data.get("amount") || "") });
      const saved = await payload(await api!.createEmployeeAdvance(body));
      setToast(`Advance ${text(saved, "name")} requested`, "success");
      await refreshExpenseLists();
    }, "expenses");
  });
  document.querySelectorAll<HTMLButtonElement>("[data-withdraw]").forEach((button) => {
    button.onclick = () => {
      const name = button.dataset.withdraw || "";
      if (!name || !window.confirm("Withdraw this leave application?")) return;
      void runSelfService("Withdrawing leave", async () => {
        await payload(await api!.cancelLeaveApplication({ name }));
        leaveRows = leaveRows.map((row) => (text(row, "name") === name ? { ...row, status: "Cancelled" } : row));
        setToast("Leave application withdrawn", "success");
        void refresh();
      }, "leave");
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-payslip]").forEach((button) => {
    button.onclick = () => {
      const name = button.dataset.payslip || "";
      void runSelfService("Preparing payslip", async () => {
        const file = await raceWithTimeout(async () => payload(await api!.getPayslipPdf({ name })), 60_000, "The payslip PDF took too long. Try again.");
        await savePdf(safePdfName(text(file, "filename")), text(file, "content"));
      }, "pay");
    };
  });
  document.querySelector<HTMLButtonElement>("#mark-all-read")?.addEventListener("click", () => {
    void runSelfService("Updating", async () => {
      await payload(await api!.markNotificationsRead({}));
      notifications = notifications.map((row) => ({ ...row, read: 1 }));
      unreadCount = 0;
    }, "notifications");
  });
  document.querySelectorAll<HTMLButtonElement>("[data-notification]").forEach((button) => {
    button.onclick = () => {
      const name = button.dataset.notification || "";
      const row = notifications.find((entry) => text(entry, "name") === name);
      if (!row || Number(row.read) || !api || previewMode) return;
      row.read = 1;
      unreadCount = Math.max(0, unreadCount - 1);
      render("notifications");
      void api.markNotificationsRead({ name }).catch(() => undefined);
    };
  });
  document.querySelector<HTMLFormElement>("#profile-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const form: Record<string, string> = {};
    for (const [key] of PROFILE_FIELDS) form[key] = String(data.get(key) ?? "");
    void runSelfService("Saving", async () => {
      const updates = profileUpdates(form, profileFormBase);
      if (!updates) { setToast("Nothing changed", "info"); return; }
      const saved = await payload(await api!.updateProfile({ updates }));
      profileData = { ...profileData, ...((saved.profile || {}) as Row) };
      setToast("Your details were saved", "success");
    }, "editprofile");
  });
  document.querySelector<HTMLFormElement>("#document-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const picked = new FormData(event.currentTarget as HTMLFormElement).get("file");
    const file = picked instanceof File && picked.size ? picked : null;
    void runSelfService("Uploading", async () => {
      const problem = uploadProblem(file);
      if (problem || !file) throw new Error(problem || "Choose a file first.");
      await payload(await api!.uploadDocument({ filename: file.name, content: await readFileAsBase64(file) }));
      setToast(`${file.name} uploaded`, "success");
      try { documents = list(await payload(await api!.getDocuments())); } catch { /* shown on next open */ }
    }, "documents");
  });
}

/**
 * Hand the payslip PDF to the system. On the phone it is written to the app cache with
 * @capacitor/filesystem and opened in the Android share sheet (@capacitor/share), from where
 * the employee can save it to Files/Drive, open it in a PDF viewer or send it. In a browser
 * (preview/dev) it falls back to a normal download link.
 */
async function savePdf(filename: string, base64: string): Promise<void> {
  if (!base64) throw new Error("The server returned an empty PDF.");
  if (Capacitor.isNativePlatform()) {
    const written = await Filesystem.writeFile({ path: `payslips/${filename}`, data: base64, directory: Directory.Cache, recursive: true });
    try {
      await Share.share({ title: filename, dialogTitle: "Save or open your payslip", files: [written.uri] });
    } catch (error) {
      // Closing the share sheet without choosing an app is not an error for the employee.
      if (!/cancel/i.test(error instanceof Error ? error.message : String(error))) throw new Error("Could not open the payslip. Install a PDF viewer or Files app and try again.");
    }
    return;
  }
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  setToast(`${filename} downloaded`, "success");
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
    root.innerHTML = `${toastHtml()}<section class="auth"><div class="auth-hero">${brandMark()}<h1>Aimatic HR</h1><p>${esc(loading)}…</p></div><div class="auth-card"><div class="skeleton" aria-busy="true">${loadingSkeleton(4)}</div></div></section>`;
    return;
  }
  const pages: Record<Screen, () => string> = { home, attendance, calendar: calendarScreen, leave, pay, enroll, profile, approvals: approvalsScreen, expenses: expensesScreen, notifications: notificationsScreen, editprofile: editProfileScreen, documents: documentsScreen };
  // Exactly 5 tabs — never Enroll in the bar (wraps on ~360px / real phones). Enroll stays manager-only via Home tile + Profile.
  const nav: Array<{ id: Screen; label: string; icon: string }> = [
    { id: "home", label: "Home", icon: icon("home", 22) },
    { id: "attendance", label: "Attend", icon: icon("map-pin", 22) },
    { id: "leave", label: "Leave", icon: icon("calendar", 22) },
    { id: "pay", label: "Pay", icon: icon("credit-card", 22) },
    { id: "profile", label: "Profile", icon: icon("user", 22) },
  ];
  if (!isManager() && screen === "enroll") screen = "home";
  const navActive: Screen = screen === "enroll" || screen === "editprofile" || screen === "documents" ? "profile" : screen === "calendar" ? "attendance" : ["approvals", "expenses", "notifications"].includes(screen) ? "home" : screen;
  // Pull the live enroll video out of the old DOM before it is discarded, so re-rendering the
  // capture step (new photo taken, retake, etc.) doesn't restart/black-flash the camera preview.
  const existingEnrollVideo = screen === "enroll" ? document.querySelector<HTMLVideoElement>("#enroll-video") : null;
  const preservedEnrollVideo = existingEnrollVideo && existingEnrollVideo.srcObject ? existingEnrollVideo : null;
  preservedEnrollVideo?.remove();
  root.innerHTML = `${toastHtml()}<section class="shell">${pageHeader(screen)}<main class="page">${pages[screen]()}</main>${bottomNavigation("HR", navActive, nav)}</section>`;
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
      if (button.dataset.screen === "calendar") {
        calendarReturn = screen === "home" ? "home" : "attendance";
        void loadCalendar(localIsoDate().slice(0, 7));
        return;
      }
      const target = button.dataset.screen as Screen;
      render(target);
      void openScreenData(target);
    };
  });
  bindSelfService();
  // A manual refresh mid check-in would repaint #attend-video out from under the live capture.
  document.querySelector<HTMLButtonElement>("#refresh")?.addEventListener("click", () => { if (!attendBusy) void refresh(); });
  document.querySelector<HTMLButtonElement>("#cal-prev")?.addEventListener("click", () => void loadCalendar(shiftMonth(calendarMonth, -1)));
  document.querySelector<HTMLButtonElement>("#cal-next")?.addEventListener("click", () => void loadCalendar(shiftMonth(calendarMonth, 1)));
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
