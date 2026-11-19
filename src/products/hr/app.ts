import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Geolocation } from "@capacitor/geolocation";
import { createHrApi } from "../../api/hr";
import { sanitizeRichText } from "./richtext";
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
type Screen = "home" | "attendance" | "calendar" | "leave" | "pay" | "enroll" | "profile" | "approvals" | "expenses" | "notifications" | "editprofile" | "documents" | "help" | "ticket" | "policies" | "policy" | "requests" | "assets" | "notices" | "goals" | "goal" | "meetings" | "meeting" | "points";
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
// Phase 3 HR operations state
let helpData: Row = {};
let helpQuery = "";
let ticketDetail: Row | null = null;
/** The ticket / policy the employee opened last; late responses for another item are ignored. */
let ticketWanted = "";
let policyWanted = "";
let policies: Row[] = [];
let policyPending = 0;
let policyDetail: Row | null = null;
let docRequests: Row[] = [];
let letterTypes: string[] = [];
let myAssets: Row[] = [];
let assetRequests: Row[] = [];
let notices: Row[] = [];
let noticesPending = 0;
// Phase 4 talent state
let goals: Row[] = [];
let goalWanted = "";
let meetings: Row[] = [];
let meetingReports: Row[] = [];
let meetingHasManager = false;
let meetingDetail: Row | null = null;
let meetingWanted = "";
let pointsData: Row = {};
let colleagueResults: Row[] = [];
let colleagueQuery = "";

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

const screenTitles: Record<Screen, string> = { home: "Home", attendance: "Attendance", calendar: "Attendance calendar", leave: "Leave", pay: "Payslips", enroll: "Face enrollment", profile: "Profile", approvals: "Approvals", expenses: "Expenses & advances", notifications: "Notifications", editprofile: "Edit details", documents: "My documents", help: "Help desk", ticket: "Ticket", policies: "Company policies", policy: "Policy", requests: "Letters & documents", assets: "My assets", notices: "Notices", goals: "My goals", goal: "Goal check-in", meetings: "1-on-1s", meeting: "1-on-1", points: "Bonus points" };

/** Consistent page header: Home shows the greeting; sub-screens get a back arrow. */
function pageHeader(current: Screen): string {
  if (current === "home") {
    const hour = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const name = text(context, "employee_name") || "Employee";
    return `<header class="page-header home">${avatar(name)}<div class="grow"><p class="ph-kicker">${esc(greet)}</p><h1 class="ph-title">${esc(name.split(/\s+/)[0] || name)}</h1></div><button type="button" class="ph-action bell" data-screen="notifications" aria-label="${unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}">${hrIcon("bell", 20)}${unreadCount ? `<span class="ph-badge">${unreadCount > 99 ? "99+" : unreadCount}</span>` : ""}</button><button type="button" class="ph-action" id="refresh" aria-label="Refresh">${icon("refresh", 20)}</button></header>`;
  }
  const backTargets: Partial<Record<Screen, Screen>> = { enroll: "home", approvals: "home", expenses: "home", notifications: "home", editprofile: "profile", documents: "profile", help: "home", ticket: "help", policies: "home", policy: "policies", requests: "home", assets: "home", notices: "home", goals: "home", goal: "goals", meetings: "home", meeting: "meetings", points: "home" };
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
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
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
      if (screen === "ticket") { render("help"); return; }
      if (screen === "policy") { render("policies"); return; }
      if (screen === "goal") { render("goals"); return; }
      if (screen === "meeting") { render("meetings"); return; }
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
  helpData = {
    categories: ["Payroll", "Leave & attendance", "IT access", "Other"],
    faqs: [
      { name: "q1", question: "When is salary credited?", answer: "<p>Salary is credited on the <b>last working day</b> of each month.</p>", category: "Payroll" },
      { name: "q2", question: "How do I correct a missed check-in?", answer: "<p>Open Attendance → Attendance request and choose the day.</p>", category: "Leave & attendance" },
    ],
    tickets: [
      { name: "HR-TKT-2026-00012", subject: "Overtime not in October slip", category: "Payroll", priority: "High", status: "In Progress", creation: "2026-11-15 10:12:00" },
      { name: "HR-TKT-2026-00009", subject: "ERP password reset", category: "IT access", priority: "Medium", status: "Resolved", creation: "2026-11-03 09:40:00" },
    ],
  };
  ticketDetail = { ticket: { name: "HR-TKT-2026-00012", subject: "Overtime not in October slip", category: "Payroll", priority: "High", status: "In Progress", description: "I worked 6 hours overtime on 21 Oct but it is not on my slip.", creation: "2026-11-15 10:12:00", due_by: "2026-11-17 10:12:00", assigned_to: "Sara Khan" }, comments: [{ author: "Sara Khan", mine: false, content: "Checking with payroll, will update by tomorrow.", creation: "2026-11-15 14:03:00" }, { author: "You", mine: true, content: "Thanks, attendance shows the hours.", creation: "2026-11-15 14:20:00" }] };
  policies = [
    { name: "HR-POL-00003", title: "Code of conduct", policy_version: 2, effective_from: "2026-11-01", requires_acknowledgement: 1, summary: "Behaviour, conflicts of interest and gifts.", acknowledged: false, pending: true },
    { name: "HR-POL-00002", title: "Leave policy 2026", policy_version: 1, effective_from: "2026-01-01", requires_acknowledgement: 1, summary: "Annual, casual and sick leave rules.", acknowledged: true, pending: false },
    { name: "HR-POL-00001", title: "IT acceptable use", policy_version: 1, effective_from: "2025-07-01", requires_acknowledgement: 0, summary: "Laptops, email and passwords.", acknowledged: false, pending: false },
  ];
  policyPending = 1;
  policyDetail = { name: "HR-POL-00003", title: "Code of conduct", policy_version: 2, effective_from: "2026-11-01", requires_acknowledgement: 1, summary: "Behaviour, conflicts of interest and gifts.", content: "<h3>1. Respect at work</h3><p>Treat colleagues and customers with respect. Harassment of any kind is not tolerated.</p><h3>2. Conflicts of interest</h3><p>Declare any personal interest in a supplier or customer to HR.</p><h3>3. Gifts</h3><p>Gifts above PKR 5,000 must be declared.</p>", acknowledged: false };
  docRequests = [
    { name: "HR-DOC-2026-00021", direction: "Employee requests letter", document_type: "Salary Certificate", purpose: "Bank loan", status: "Issued", has_issued_file: true, creation: "2026-11-12 11:00:00" },
    { name: "HR-DOC-2026-00024", direction: "HR requests document", document_type: "Updated CNIC copy", status: "Requested", due_date: "2026-11-25", hr_note: "Your CNIC on file has expired.", creation: "2026-11-18 09:00:00" },
  ];
  letterTypes = ["Experience Letter", "Salary Certificate", "Employment Verification", "NOC", "Other"];
  myAssets = [{ name: "AST-0007", asset_name: "Dell Latitude 5440", item_code: "LAPTOP", status: "In Use", location: "Head Office" }, { name: "AST-0019", asset_name: "Office SIM (Jazz)", item_code: "SIM", status: "In Use" }];
  assetRequests = [{ name: "HR-AST-2026-00005", request_type: "Request", item_description: "Second monitor", status: "Approved", creation: "2026-11-14 12:00:00" }];
  notices = [{ name: "HR-DIS-2026-00002", action_type: "Written Warning", subject: "Repeated late arrival", description: "<p>You were late on 6 occasions in October.</p>", incident_date: "2026-10-31", status: "Issued" }];
  noticesPending = 1;
  goals = [
    { name: "G-1", goal_name: "Grow Lahore retail sales 15%", is_group: 1, progress: 48, status: "In Progress", end_date: "2026-12-31" },
    { name: "G-2", goal_name: "Open 2 new franchise stores", parent_goal: "G-1", is_group: 0, progress: 50, status: "In Progress", end_date: "2026-12-15", confidence: "On track", check_ins: [{ name: "C-2", check_in_date: "2026-11-10", progress: 50, previous_progress: 20, confidence: "On track", note: "DHA store signed." }] },
    { name: "G-3", goal_name: "Cut stock-outs below 2%", parent_goal: "G-1", is_group: 0, progress: 35, status: "In Progress", end_date: "2026-12-31", confidence: "At risk", check_ins: [{ name: "C-3", check_in_date: "2026-11-12", progress: 35, previous_progress: 30, confidence: "At risk", note: "Supplier delays on dairy." }] },
    { name: "G-4", goal_name: "Finish food-safety certification", is_group: 0, progress: 100, status: "Completed", end_date: "2026-10-31", confidence: "On track", check_ins: [] },
  ];
  goalWanted = "G-3";
  meetings = [
    { name: "HR-1ON1-2026-00008", employee: "EMP-0007", employee_name: "Ahmed Nabeel", manager: "EMP-0002", manager_name: "Sara Khan", scheduled_on: "2026-11-24 11:00:00", status: "Scheduled", agenda: "Q4 targets, training plan", role: "employee" },
    { name: "HR-1ON1-2026-00005", employee: "EMP-0007", employee_name: "Ahmed Nabeel", manager: "EMP-0002", manager_name: "Sara Khan", scheduled_on: "2026-11-03 11:00:00", status: "Completed", agenda: "October review", role: "employee" },
  ];
  meetingHasManager = true;
  meetingDetail = { ...meetings[0], shared_notes: "Discuss DHA store opening and the stock-out plan.", modified: "2026-11-18 10:00:00", action_items: [{ description: "Share supplier delay report", owner_role: "Employee", due_date: "2026-11-21", done: 1 }, { description: "Approve weekend staffing", owner_role: "Manager", due_date: "2026-11-25", done: 0 }] };
  meetingWanted = "HR-1ON1-2026-00008";
  pointsData = {
    balance: 85, allowance_left: 35, categories: ["Teamwork", "Customer", "Innovation", "Ownership", "Other"],
    settings: { enabled: 1, monthly_allowance: 50, max_per_entry: 10, approval_above: 20, redemption_mode: "HR-approved redemption requests", min_redemption: 50, point_value_note: "1 point = PKR 10 shopping voucher" },
    received: [{ name: "HR-BPE-2026-00031", given_by_name: "Bilal Raza", points: 10, category: "Customer", reason: "Handled the Saturday rush calmly", status: "Approved", docstatus: 1, creation: "2026-11-16 18:20:00" }, { name: "HR-BPE-2026-00027", given_by_name: "Sara Khan", points: 5, category: "Ownership", reason: "Fixed the price-tag mismatch", status: "Approved", docstatus: 1, creation: "2026-11-09 12:00:00" }],
    given: [{ name: "HR-BPE-2026-00033", employee_name: "Hina Malik", points: 5, category: "Teamwork", reason: "Covered my shift", status: "Approved", docstatus: 1, creation: "2026-11-17 09:00:00" }],
    redemptions: [],
  };
  colleagueResults = [{ name: "EMP-0011", employee_name: "Hina Malik", designation: "Cashier" }, { name: "EMP-0014", employee_name: "Usman Tariq", designation: "Store Supervisor" }];
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
      optional(async () => payload(await api!.getPolicies())),
      optional(async () => payload(await api!.getDisciplinary())),
    ]);
    const results = await Promise.all(tasks);
    const [approvalData, expenseData, notificationData, policyData, noticeData] = await extra;
    if (policyData) { policies = list(policyData.policies); policyPending = Number(policyData.pending) || 0; }
    if (noticeData) { notices = list(noticeData.notices); noticesPending = Number(noticeData.pending) || 0; }
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
    if (!loading) { if (pageFormDirty()) patchLiveParts(screen); else render(screen); }
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
  const services: Array<[Screen, string, string, string, number]> = [
    ["help", "help", "Help desk", "Ask HR, track your tickets, FAQs", 0],
    ["policies", "book", "Company policies", policyPending ? `${policyPending} waiting for your acknowledgement` : "Read company policies", policyPending],
    ["requests", "file", "Letters & documents", "Salary certificate, experience letter, papers HR asked for", 0],
    ["assets", "box", "My assets", "Laptop, SIM and other company items", 0],
  ];
  if (notices.length) services.push(["notices", "alert-circle", "Notices", noticesPending ? `${noticesPending} needs your response` : "Notices from HR", noticesPending]);
  const growth: Array<[Screen, string, string, string]> = [
    ["goals", "target", "My goals", "Check in on your OKRs"],
    ["meetings", "users", "1-on-1s", "Agenda, notes and action items with your manager"],
    ["points", "award", "Bonus points", "Thank a colleague, see your points"],
  ];
  const growthHtml = `<div class="stack-sm">${sectionTitle("Growth")}<div class="list">${growth.map(([id, ic, label, sub]) => `<button type="button" class="list-row nav-row" data-screen="${id}"><span class="row-icon">${hrIcon(ic, 18)}</span><div class="grow"><strong>${esc(label)}</strong><span class="t-meta">${esc(sub)}</span></div>${icon("chevron-right", 18)}</button>`).join("")}</div></div>`;
  const servicesHtml = `<div class="stack-sm">${sectionTitle("HR services")}<div class="list">${services.map(([id, ic, label, sub, count]) => `<button type="button" class="list-row nav-row" data-screen="${id}"><span class="row-icon${count ? " warn" : ""}">${hrIcon(ic, 18)}</span><div class="grow"><strong>${esc(label)}</strong><span class="t-meta">${esc(sub)}</span></div>${count ? `<span class="count-pill warn">${count}</span>` : ""}${icon("chevron-right", 18)}</button>`).join("")}</div></div>`;
  return `<section class="stack-lg">
    ${todayCard}
    ${pendingBanner}
    ${quick}
    ${servicesHtml}
    ${growthHtml}
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
      <article class="card stat-hero" data-live="hero"><p class="t-label">Outstanding advance</p><strong class="pay-amount">${esc(formatMoney(outstanding, currency))}</strong><p class="t-meta">Paid to you and not yet claimed or returned</p></article>
      <form id="advance-form" class="card stack">
        <h2 class="t-title">Request an advance</h2>
        ${field("Purpose", `<textarea name="purpose" required placeholder="e.g. Travel to Karachi branch"></textarea>`)}
        ${field(`Amount (${currency})`, `<input name="amount" type="number" inputmode="decimal" min="1" step="0.01" required>`)}
        ${btn("Send request", { kind: "primary", block: true, disabled: Boolean(ssBusy), attrs: 'type="submit"' })}
      </form>
      <div class="stack-sm" data-live="list">${sectionTitle("My advances")}${rowsHtml}</div>
    </section>`;
  }
  const types = list(expenseOptions.types).map((row) => `<option>${esc(text(row, "name"))}</option>`).join("");
  const approverName = text((expenseOptions.approver || {}) as Row, "expense_approver_name");
  const pending = expenseClaims.filter((row) => text(row, "approval_status") === "Draft").reduce((sum, row) => sum + (Number(row.total_claimed_amount) || 0), 0);
  const rowsHtml = expenseClaims.length
    ? `<div class="list">${expenseClaims.map((row) => { const status = text(row, "approval_status") === "Draft" ? "Pending" : text(row, "status") || text(row, "approval_status"); return `<article class="list-row"><span class="row-icon">${hrIcon("receipt", 18)}</span><div class="grow"><strong>${esc(text(row, "expense_type") || "Expense")}</strong><span class="t-meta">${esc(formatDay(text(row, "posting_date")))} · ${esc(text(row, "name"))}</span></div><div class="row-trail-stack"><b>${esc(formatMoney(row.total_claimed_amount, text(row, "currency") || currency))}</b>${statusBadge(status, statusTone(status))}</div></article>`; }).join("")}</div>`
    : emptyState(hrIcon("receipt", 24), "No expense claims", "Claims you submit will appear here with their status.");
  return `<section class="stack-lg">${tabs}
    <article class="card stat-hero" data-live="hero"><p class="t-label">Waiting for approval</p><strong class="pay-amount">${esc(formatMoney(pending, currency))}</strong><p class="t-meta">${approverName ? `Approver: ${esc(approverName)}` : "Sent to your expense approver"}</p></article>
    <form id="expense-form" class="card stack">
      <h2 class="t-title">New expense claim</h2>
      <div class="grid-2">${field("Date", `<input name="expenseDate" type="date" max="${localIsoDate()}" value="${localIsoDate()}" required>`)}${field(`Amount (${currency})`, `<input name="amount" type="number" inputmode="decimal" min="1" step="0.01" required>`)}</div>
      ${field("Type", `<select name="expenseType" required>${types || "<option value=''>No expense types set up</option>"}</select>`)}
      ${field("Description", `<textarea name="description" placeholder="What was it for?"></textarea>`)}
      ${field("Receipt (optional)", `<input name="receipt" type="file" accept="${UPLOAD_ACCEPT}" capture="environment">`)}
      ${btn("Submit claim", { kind: "primary", block: true, disabled: Boolean(ssBusy), attrs: 'type="submit"' })}
    </form>
    <div class="stack-sm" data-live="list">${sectionTitle("My claims")}${rowsHtml}</div>
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
    <div class="stack-sm" data-live="list">${sectionTitle("Uploaded")}${rowsHtml}</div>
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
// Controls rendered with data-locked (e.g. no allowance left, cancelled meeting) stay disabled.
function setBusyControls(busy: boolean) {
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(SS_CONTROLS).forEach((control) => { control.disabled = busy || control.hasAttribute("data-locked"); });
  document.querySelectorAll<HTMLFormElement>("main.page form").forEach((form) => { if (busy) form.dataset.submitting = "1"; else delete form.dataset.submitting; });
}

/**
 * Runs one self-service action. Controls are disabled in place (no re-render) so a failed
 * validation or request keeps what the employee typed and the file they picked. Only a
 * successful action re-renders, and only the screen it belongs to; if the employee moved to
 * another screen meanwhile, that screen just gets its controls re-enabled.
 */
const DRAFT_SAFE_SCREENS: Screen[] = ["points", "meetings", "help", "requests", "assets", "expenses", "documents"];
/** The form whose submit started the current action, so other forms' drafts can be kept. */
let lastSubmittedForm: HTMLFormElement | null = null;
if (typeof document !== "undefined") document.addEventListener("submit", (event) => { lastSubmittedForm = event.target instanceof HTMLFormElement ? event.target : null; }, true);

async function runSelfService(label: string, task: () => Promise<void>, owner: Screen) {
  if (!api || previewMode || ssBusy) return;
  if (offline()) { setToast("You appear offline. Reconnect and try again.", "danger"); return; }
  ssBusy = label;
  // Taken now, while this action's own submit is the latest one; a later (rejected) submit must
  // not change which form this action resets.
  const submittedForm = lastSubmittedForm && lastSubmittedForm.isConnected ? lastSubmittedForm : null;
  lastSubmittedForm = null;
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
    const freshEdits = Boolean(document.querySelector("main.page form[data-dirty]:not([data-submitting]):not([role=search])"));
    const submitted = submittedForm && submittedForm.isConnected ? submittedForm : null;
    // Another form on the same page has a draft (e.g. redeem while giving points): keep it, but
    // only on screens whose changing parts patchLiveParts() fully refreshes.
    const otherDraft = DRAFT_SAFE_SCREENS.includes(owner) && Array.from(document.querySelectorAll<HTMLFormElement>("main.page form[data-dirty]:not([role=search])")).some((form) => form !== submitted);
    if (ok && screen === owner && !freshEdits && !otherDraft) render(owner);
    else if (ok && screen === owner && submitted && otherDraft) {
      submitted.reset();
      delete submitted.dataset.dirty;
      setBusyControls(false);
      patchLiveParts(owner);
    } else setBusyControls(false);
  }
}

/** Best-effort list refresh after a successful create: a failure here must not look like the create failed. */
async function refreshExpenseLists() {
  try {
    const fresh = await payload(await api!.getExpenses());
    expenseClaims = list(fresh.claims); advances = list(fresh.advances);
  } catch { /* the new item appears on the next refresh */ }
}

/**
 * Re-render only the read-only parts ([data-live] lists/totals) of the current page and sync the
 * expense-type options, leaving every form field the employee is editing untouched.
 */
function patchLiveParts(current: Screen) {
  const builders: Partial<Record<Screen, () => string>> = { expenses: expensesScreen, documents: documentsScreen, help: helpScreen, requests: requestsScreen, assets: assetsScreen, meetings: meetingsScreen, points: pointsScreen };
  const build = builders[current];
  if (build && screen === current) {
    const fresh = document.createElement("div");
    fresh.innerHTML = build();
    document.querySelectorAll<HTMLElement>("main.page [data-live]").forEach((el) => {
      // A section holding a form the employee is filling in (e.g. a picked upload) is left alone.
      if (el.querySelector("form[data-dirty]")) return;
      const next = fresh.querySelector<HTMLElement>(`[data-live="${el.dataset.live}"]`);
      if (next) el.replaceWith(next);
    });
  }
  if (current === "requests") syncSelect(document.querySelector<HTMLSelectElement>('#letter-form select[name="documentType"]'), letterTypes.map((t) => `<option>${esc(t)}</option>`).join(""));
  if (current === "assets") {
    syncSelect(document.querySelector<HTMLSelectElement>('#asset-form select[name="requestType"]'), assetTypeOptions());
    syncSelect(document.querySelector<HTMLSelectElement>('#asset-form select[name="asset"]'), `<option value="">—</option>${myAssets.map((row) => `<option value="${esc(text(row, "name"))}">${esc(text(row, "asset_name") || text(row, "name"))}</option>`).join("")}`);
    const assetField = document.querySelector<HTMLElement>("#asset-form [data-asset-field]");
    if (assetField) assetField.hidden = !myAssets.length;
  }
  if (current === "points") syncPointLimits();
  if (screen === current) { bindLiveRows(); bindTalentRows(); }
  const select = current === "expenses" ? document.querySelector<HTMLSelectElement>('#expense-form select[name="expenseType"]') : null;
  const types = list(expenseOptions.types).map((row) => text(row, "name")).filter(Boolean);
  if (select && types.length) {
    const shown = Array.from(select.options).map((option) => option.value);
    if (shown.join("\u0000") !== types.join("\u0000")) {
      const keep = types.includes(select.value) ? select.value : "";
      select.innerHTML = types.map((name) => `<option>${esc(name)}</option>`).join("");
      if (keep) select.value = keep;
    }
  }
}

/** True once the employee has typed into or picked a file in a form on the current page. */
function pageFormDirty(): boolean {
  return Boolean(document.querySelector("main.page form[data-dirty]:not([role=search])"));
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
    else if (next === "help") { const asked = helpQuery; const data = await payload(await api.getHelp({ query: asked })); if (asked !== helpQuery) return; helpData = data; }
    else if (next === "policies") { const data = await payload(await api.getPolicies()); policies = list(data.policies); policyPending = Number(data.pending) || 0; }
    else if (next === "requests") { const data = await payload(await api.getDocumentRequests()); docRequests = list(data.requests); letterTypes = (Array.isArray(data.letter_types) ? data.letter_types : []).map(String); }
    else if (next === "assets") { const data = await payload(await api.getAssets()); myAssets = list(data.assets); assetRequests = list(data.requests); }
    else if (next === "goals") goals = list((await payload(await api.getGoals())).goals);
    else if (next === "meetings") { const data = await payload(await api.getOneOnOnes()); meetings = list(data.meetings); meetingReports = list(data.reports); meetingHasManager = Boolean(data.has_manager); }
    else if (next === "points") pointsData = await payload(await api.getPoints());
    else if (next === "notices") { const data = await payload(await api.getDisciplinary()); notices = list(data.notices); noticesPending = Number(data.pending) || 0; }
    else return;
    if (screen !== next) return;
    if (!pageFormDirty()) { render(next); return; }
    // The employee already started typing: keep their input, refresh only the read-only parts.
    patchLiveParts(next);
  } catch (error) {
    if (screen === next) setToast(error instanceof Error ? error.message : "Could not load this page", "danger");
  }
}

/** Mark a form dirty once the employee types or picks something; safe to call again on new nodes. */
function trackDirtyForms() {
  document.querySelectorAll<HTMLFormElement>("main.page form").forEach((form) => {
    if (form.dataset.tracked) return;
    form.dataset.tracked = "1";
    const mark = () => { form.dataset.dirty = "1"; };
    form.addEventListener("input", mark);
    form.addEventListener("change", mark);
  });
}

function bindSelfService() {
  trackDirtyForms();
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
async function saveFile(filename: string, base64: string): Promise<void> {
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "") || "document.pdf";
  return savePdf(safe, base64, "Save or open this document");
}

async function savePdf(filename: string, base64: string, dialogTitle = "Save or open your payslip"): Promise<void> {
  if (!base64) throw new Error("The server returned an empty PDF.");
  if (Capacitor.isNativePlatform()) {
    const written = await Filesystem.writeFile({ path: `payslips/${filename}`, data: base64, directory: Directory.Cache, recursive: true });
    try {
      await Share.share({ title: filename, dialogTitle, files: [written.uri] });
    } catch (error) {
      // Closing the share sheet without choosing an app is not an error for the employee.
      if (!/cancel/i.test(error instanceof Error ? error.message : String(error))) throw new Error("Could not open the file. Install a PDF viewer or Files app and try again.");
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

function helpScreen() {
  const faqs = list(helpData.faqs);
  const tickets = list(helpData.tickets);
  const categories = (Array.isArray(helpData.categories) ? helpData.categories : []).map((c) => `<option>${esc(String(c))}</option>`).join("");
  const faqHtml = faqs.length
    ? `<div class="list">${faqs.map((row) => `<details class="list-row faq"><summary><strong>${esc(text(row, "question"))}</strong>${icon("chevron-right", 16)}</summary><div class="rich">${sanitizeRichText(row.answer)}</div></details>`).join("")}</div>`
    : `<p class="t-meta">${helpQuery ? "No answers matched. Ask HR below." : "No FAQs published yet."}</p>`;
  const ticketHtml = tickets.length
    ? `<div class="list">${tickets.map((row) => { const st = text(row, "status"); return `<button type="button" class="list-row nav-row" data-ticket="${esc(text(row, "name"))}"><span class="row-icon">${hrIcon("help", 18)}</span><div class="grow"><strong class="ellipsis">${esc(text(row, "subject"))}</strong><span class="t-meta">${esc(text(row, "category"))} · ${esc(formatDay(text(row, "creation")))}</span></div>${statusBadge(st, statusTone(st))}</button>`; }).join("")}</div>`
    : emptyState(hrIcon("help", 24), "No tickets yet", "Questions you send to HR will appear here.");
  return `<section class="stack-lg">
    <form id="faq-search" class="search-bar" role="search">${icon("search", 18)}<input name="q" type="search" placeholder="Search answers" value="${esc(helpQuery)}" aria-label="Search answers"></form>
    <div class="stack-sm" data-live="faq">${sectionTitle("Common questions")}${faqHtml}</div>
    <form id="ticket-form" class="card stack">
      <h2 class="t-title">Ask HR</h2>
      ${field("Subject", `<input name="subject" maxlength="140" required placeholder="Short summary">`)}
      <div class="grid-2">${field("Category", `<select name="category" required>${categories || "<option value=''>No categories yet</option>"}</select>`)}${field("Priority", `<select name="priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Urgent</option></select>`)}</div>
      ${field("Details", `<textarea name="description" required maxlength="5000" placeholder="What do you need help with?"></textarea>`)}
      ${btn(`${hrIcon("send", 16)} Send to HR`, { kind: "primary", block: true, attrs: 'type="submit"' })}
    </form>
    <div class="stack-sm" data-live="list">${sectionTitle("My tickets")}${ticketHtml}</div>
  </section>`;
}

function ticketScreen() {
  const ticket = (ticketDetail?.ticket || {}) as Row;
  if (!text(ticket, "name")) return `<div class="skeleton" aria-busy="true">${loadingSkeleton(4)}</div>`;
  const st = text(ticket, "status");
  const comments = list(ticketDetail?.comments);
  const closed = st === "Closed";
  const resolved = st === "Resolved" || closed;
  const thread = comments.length
    ? `<div class="thread">${comments.map((c) => `<div class="bubble${c.mine ? " mine" : ""}"><span class="t-meta">${esc(text(c, "author"))} · ${esc(formatDateTime(text(c, "creation")))}</span><p>${esc(text(c, "content"))}</p></div>`).join("")}</div>`
    : `<p class="t-meta">No replies yet.</p>`;
  return `<section class="stack-lg">
    <article class="card stack">
      <div class="row-between"><span class="t-label">${esc(text(ticket, "name"))}</span>${statusBadge(st, statusTone(st))}</div>
      <h2 class="t-title">${esc(text(ticket, "subject"))}</h2>
      <p>${esc(text(ticket, "description"))}</p>
      <div class="info-card">${infoRow("Category", text(ticket, "category"))}${infoRow("Priority", text(ticket, "priority"))}${infoRow("Assigned to", text(ticket, "assigned_to"))}${infoRow("Reply expected by", formatDateTime(text(ticket, "due_by")))}</div>
      ${text(ticket, "resolution") ? `<div class="banner success">${esc(text(ticket, "resolution"))}</div>` : ""}
    </article>
    <div class="stack-sm">${sectionTitle("Conversation")}${thread}</div>
    ${closed ? "" : `<form id="ticket-reply" class="card stack">${field("Reply", `<textarea name="message" required maxlength="3000" placeholder="Add a message for HR"></textarea>`)}${btn(`${hrIcon("send", 16)} Send reply`, { kind: "primary", block: true, attrs: 'type="submit"' })}</form>`}
    ${resolved ? `<div class="card stack"><p class="t-label">How did HR do?</p><div class="stars" role="group" aria-label="Rate this ticket">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star${Math.round(Number(ticket.rating || 0) * 5) >= n ? " on" : ""}" data-rate="${n}" aria-label="${n} star${n === 1 ? "" : "s"}">★</button>`).join("")}</div></div>` : ""}
    <div class="grid-2">${resolved ? btn("Reopen", { kind: "secondary", block: true, attrs: 'data-ticket-action="reopen"' }) : ""}${closed ? "" : btn("Close ticket", { kind: "secondary", block: true, attrs: 'data-ticket-action="close"' })}</div>
  </section>`;
}

function policiesScreen() {
  if (!policies.length) return emptyState(hrIcon("book", 26), "No policies yet", "Company policies published by HR will appear here.");
  return `<section class="stack-lg">
    ${policyPending ? `<div class="banner warn">${icon("alert-circle", 16)}<span>${policyPending} polic${policyPending === 1 ? "y needs" : "ies need"} your acknowledgement.</span></div>` : ""}
    <div class="list">${policies.map((row) => { const chip = row.pending ? statusBadge("Acknowledge", "warning") : row.acknowledged ? statusBadge("Acknowledged", "success") : ""; return `<button type="button" class="list-row nav-row" data-policy="${esc(text(row, "name"))}"><span class="row-icon${row.pending ? " warn" : ""}">${hrIcon("book", 18)}</span><div class="grow"><strong>${esc(text(row, "title"))}</strong><span class="t-meta">v${esc(text(row, "policy_version") || "1")} · from ${esc(formatDay(text(row, "effective_from")))}${text(row, "summary") ? ` · ${esc(text(row, "summary"))}` : ""}</span></div>${chip}</button>`; }).join("")}</div>
  </section>`;
}

function policyScreen() {
  const doc = policyDetail || {};
  if (!text(doc, "name")) return `<div class="skeleton" aria-busy="true">${loadingSkeleton(5)}</div>`;
  const needs = Number(doc.requires_acknowledgement) && !doc.acknowledged;
  return `<section class="stack-lg">
    <article class="card stack">
      <div class="row-between"><span class="t-label">Version ${esc(text(doc, "policy_version") || "1")} · from ${esc(formatDay(text(doc, "effective_from")))}</span>${doc.acknowledged ? statusBadge("Acknowledged", "success") : ""}</div>
      <h2 class="t-title">${esc(text(doc, "title"))}</h2>
      ${text(doc, "summary") ? `<p class="t-meta">${esc(text(doc, "summary"))}</p>` : ""}
      ${doc.has_attachment ? btn(`${hrIcon("file", 16)} Open attached document`, { id: "policy-file", kind: "secondary", block: true }) : ""}
      <div class="rich policy-body">${sanitizeRichText(doc.content) || (doc.has_attachment ? "<p>The full policy is in the attached document.</p>" : "<p>No text published.</p>")}</div>
    </article>
    ${needs ? `<div class="sticky-actions"><label class="check-row"><input type="checkbox" id="policy-read"> I have read and understood this policy.</label>${btn("Acknowledge", { id: "policy-ack", kind: "primary", block: true, disabled: true })}</div>` : ""}
  </section>`;
}

function requestsScreen() {
  const fromHr = docRequests.filter((row) => text(row, "direction") === "HR requests document");
  const letters = docRequests.filter((row) => text(row, "direction") !== "HR requests document");
  const hrHtml = fromHr.length ? `<div class="stack-sm">${sectionTitle("HR asked you for")}${fromHr.map((row) => { const st = text(row, "status"); const open = st === "Requested" || st === "Rejected"; return `<article class="card stack"><div class="row-between"><strong>${esc(text(row, "document_type"))}</strong>${statusBadge(st, statusTone(st))}</div>${text(row, "hr_note") ? `<p class="t-meta">${esc(text(row, "hr_note"))}</p>` : ""}${text(row, "due_date") ? `<p class="t-meta">Due ${esc(formatDay(text(row, "due_date")))}</p>` : ""}${open ? `<form class="stack" data-upload-request="${esc(text(row, "name"))}"><label class="file-drop compact"><input name="file" type="file" accept="${UPLOAD_ACCEPT}" required><span>${hrIcon("upload", 18)} Choose file</span></label>${btn("Upload", { kind: "primary", block: true, attrs: 'type="submit"' })}</form>` : ""}</article>`; }).join("")}</div>` : "";
  const letterHtml = letters.length
    ? `<div class="list">${letters.map((row) => { const st = text(row, "status"); return `<article class="list-row"><span class="row-icon">${hrIcon("file", 18)}</span><div class="grow"><strong>${esc(text(row, "document_type"))}</strong><span class="t-meta">${esc(formatDay(text(row, "creation")))}${text(row, "purpose") ? ` · ${esc(text(row, "purpose"))}` : ""}</span></div><div class="row-trail-stack">${statusBadge(st, statusTone(st))}${row.has_issued_file ? `<button type="button" class="link" data-letter="${esc(text(row, "name"))}">Download</button>` : ""}</div></article>`; }).join("")}</div>`
    : emptyState(hrIcon("file", 24), "No letter requests", "Letters you ask HR for will appear here.");
  const types = letterTypes.map((t) => `<option>${esc(t)}</option>`).join("");
  return `<section class="stack-lg">
    <div data-live="hr-asks">${hrHtml}</div>
    <form id="letter-form" class="card stack">
      <h2 class="t-title">Request a letter</h2>
      ${field("Letter", `<select name="documentType" required>${types}</select>`)}
      ${field("Addressed to (optional)", `<input name="addressedTo" maxlength="140" placeholder="e.g. HBL, Embassy of …">`)}
      ${field("Purpose", `<textarea name="purpose" maxlength="1000" placeholder="Why do you need it?"></textarea>`)}
      ${btn("Send request", { kind: "primary", block: true, attrs: 'type="submit"' })}
    </form>
    <div class="stack-sm" data-live="list">${sectionTitle("My letter requests")}${letterHtml}</div>
  </section>`;
}

function assetTypeOptions(): string {
  const types: Array<[string, string]> = [["Request", "Request an item"]];
  if (myAssets.length) types.push(["Return", "Return an item"], ["Report Issue", "Report a problem"]);
  return types.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
}

/** Replace a select's options when they changed, keeping the employee's choice if it still exists. */
function syncSelect(select: HTMLSelectElement | null, optionsHtml: string) {
  if (!select) return;
  const probe = document.createElement("select");
  probe.innerHTML = optionsHtml;
  const next = Array.from(probe.options).map((o) => `${o.value}\u0001${o.text}`).join("\u0000");
  const shown = Array.from(select.options).map((o) => `${o.value}\u0001${o.text}`).join("\u0000");
  if (next === shown) return;
  const keep = select.value;
  select.innerHTML = optionsHtml;
  if (Array.from(select.options).some((o) => o.value === keep)) select.value = keep;
}

function assetsScreen() {
  const assetsHtml = myAssets.length
    ? `<div class="list">${myAssets.map((row) => `<article class="list-row"><span class="row-icon">${hrIcon("box", 18)}</span><div class="grow"><strong>${esc(text(row, "asset_name") || text(row, "name"))}</strong><span class="t-meta">${esc([text(row, "name"), text(row, "location")].filter(Boolean).join(" · "))}</span></div>${statusBadge(text(row, "status") || "In use", "info")}</article>`).join("")}</div>`
    : emptyState(hrIcon("box", 24), "No assets assigned", "Company items assigned to you will appear here.");
  const reqHtml = assetRequests.length
    ? `<div class="list">${assetRequests.map((row) => { const st = text(row, "status"); return `<article class="list-row"><span class="row-icon">${hrIcon("box", 18)}</span><div class="grow"><strong>${esc(text(row, "item_description"))}</strong><span class="t-meta">${esc(text(row, "request_type"))} · ${esc(formatDay(text(row, "creation")))}</span></div>${statusBadge(st, statusTone(st))}</article>`; }).join("")}</div>`
    : `<p class="t-meta">No requests yet.</p>`;
  const assetOptions = myAssets.map((row) => `<option value="${esc(text(row, "name"))}">${esc(text(row, "asset_name") || text(row, "name"))}</option>`).join("");
  return `<section class="stack-lg">
    <div class="stack-sm" data-live="assets">${sectionTitle("Assigned to me")}${assetsHtml}</div>
    <form id="asset-form" class="card stack">
      <h2 class="t-title">New asset request</h2>
      ${field("Type", `<select name="requestType">${assetTypeOptions()}</select>`)}
      ${field("Item", `<input name="item" maxlength="140" required placeholder="e.g. Laptop charger">`)}
      <div data-asset-field${myAssets.length ? "" : " hidden"}>${field("Asset (for return / problem)", `<select name="asset"><option value="">—</option>${assetOptions}</select>`)}</div>
      <div class="grid-2">${field("Needed by", `<input name="neededBy" type="date">`)}<div></div></div>
      ${field("Reason", `<textarea name="reason" maxlength="1000" placeholder="Why, or what is wrong?"></textarea>`)}
      ${btn("Send request", { kind: "primary", block: true, attrs: 'type="submit"' })}
    </form>
    <div class="stack-sm" data-live="list">${sectionTitle("My requests")}${reqHtml}</div>
  </section>`;
}

function noticesScreen() {
  if (!notices.length) return emptyState(icon("check-circle", 26), "No notices", "You have no notices from HR.");
  return `<section class="stack-lg">${notices.map((row) => {
    const st = text(row, "status");
    const canAck = st === "Issued";
    const canAppeal = st === "Issued" || st === "Acknowledged";
    return `<article class="card stack notice">
      <div class="row-between"><span class="t-label">${esc(text(row, "action_type"))}</span>${statusBadge(st, statusTone(st))}</div>
      <h2 class="t-title">${esc(text(row, "subject"))}</h2>
      <p class="t-meta">Incident ${esc(formatDay(text(row, "incident_date")))}${text(row, "effective_from") ? ` · effective ${esc(formatDateRange(text(row, "effective_from"), text(row, "effective_to") || text(row, "effective_from")))}` : ""}</p>
      <div class="rich">${sanitizeRichText(row.description)}</div>
      ${text(row, "employee_response") ? `<div class="banner info"><span>Your response: ${esc(text(row, "employee_response"))}</span></div>` : ""}
      ${canAppeal ? `<form class="stack" data-notice="${esc(text(row, "name"))}">${field("Your response", `<textarea name="response" maxlength="2000" placeholder="Required for an appeal, optional when acknowledging"></textarea>`)}<div class="grid-2">${btn("Appeal", { kind: "secondary", block: true, attrs: 'type="submit" data-notice-action="appeal"' })}${canAck ? btn("Acknowledge", { kind: "primary", block: true, attrs: 'type="submit" data-notice-action="acknowledge"' }) : ""}</div></form>` : ""}
    </article>`;
  }).join("")}</section>`;
}

/**
 * Bindings for rows inside [data-live] sections. They use onclick/onsubmit so calling this again
 * after patchLiveParts() replaced the nodes rebinds them without stacking handlers.
 */
function bindLiveRows() {
  trackDirtyForms();
  document.querySelectorAll<HTMLButtonElement>("[data-ticket]").forEach((button) => {
    button.onclick = () => { ticketDetail = null; ticketWanted = button.dataset.ticket || ""; render("ticket"); void loadTicket(ticketWanted); };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-policy]").forEach((button) => {
    button.onclick = () => {
      const name = button.dataset.policy || "";
      if (previewMode || !api) { render("policy"); return; }
      policyDetail = null;
      policyWanted = name;
      render("policy");
      void (async () => {
        try {
          const doc = await payload(await api!.getPolicy({ name }));
          if (policyWanted !== name) return; // the employee opened another policy meanwhile
          policyDetail = doc;
        } catch (error) { if (policyWanted === name) setToast(error instanceof Error ? error.message : "Could not open the policy", "danger"); }
        if (screen === "policy" && policyWanted === name) render("policy");
      })();
    };
  });
  document.querySelectorAll<HTMLFormElement>("[data-upload-request]").forEach((form) => {
    form.onsubmit = (event) => {
      event.preventDefault();
      const name = form.dataset.uploadRequest || "";
      const picked = new FormData(form).get("file");
      const file = picked instanceof File && picked.size ? picked : null;
      void runSelfService("Uploading", async () => {
        const problem = uploadProblem(file);
        if (problem || !file) throw new Error(problem || "Choose a file first.");
        await payload(await api!.uploadRequestedDocument({ name, filename: file.name, content: await readFileAsBase64(file) }));
        docRequests = docRequests.map((row) => (text(row, "name") === name ? { ...row, status: "Uploaded" } : row));
        setToast(`${file.name} sent to HR`, "success");
      }, "requests");
    };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-letter]").forEach((button) => {
    button.onclick = () => {
      const name = button.dataset.letter || "";
      void runSelfService("Preparing letter", async () => {
        const file = await raceWithTimeout(async () => payload(await api!.getIssuedLetter({ name })), 60_000, "The letter took too long. Try again.");
        await saveFile(text(file, "filename") || `${name}.pdf`, text(file, "content"));
      }, "requests");
    };
  });
}

// ---------------------------------------------------------------- Phase 4 talent screens

function progressBar(value: unknown, tone = ""): string {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="progress${tone ? ` ${tone}` : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>`;
}

function confidenceTone(value: string): "success" | "warning" | "danger" | "neutral" {
  return value === "On track" ? "success" : value === "At risk" ? "warning" : value === "Off track" ? "danger" : "neutral";
}

function goalsScreen() {
  if (!goals.length) return emptyState(hrIcon("target", 26), "No goals yet", "Goals your manager or HR sets for you in Frappe HR will appear here.");
  const rows = goals.map((g) => {
    const name = text(g, "name");
    const pct = Number(g.progress) || 0;
    const conf = text(g, "confidence");
    const meta = [text(g, "end_date") ? `due ${formatDay(text(g, "end_date"))}` : "", text(g, "status")].filter(Boolean).join(" · ");
    if (Number(g.is_group)) {
      return `<article class="card stack-sm goal-group"><div class="row-between"><strong>${esc(text(g, "goal_name"))}</strong><span class="t-label">${Math.round(pct)}%</span></div>${progressBar(pct)}<span class="t-meta">Objective · progress comes from its key results</span></article>`;
    }
    return `<button type="button" class="card stack-sm goal-row${g.parent_goal ? " child" : ""}" data-goal="${esc(name)}"><div class="row-between"><strong>${esc(text(g, "goal_name"))}</strong>${conf ? statusBadge(conf, confidenceTone(conf)) : ""}</div>${progressBar(pct, confidenceTone(conf) === "danger" ? "danger" : confidenceTone(conf) === "warning" ? "warn" : "")}<div class="row-between"><span class="t-meta">${esc(meta)}</span><span class="t-label">${Math.round(pct)}%</span></div></button>`;
  }).join("");
  return `<section class="stack">${rows}</section>`;
}

function goalScreen() {
  const goal = goals.find((g) => text(g, "name") === goalWanted);
  if (!goal) return `<div class="skeleton" aria-busy="true">${loadingSkeleton(4)}</div>`;
  const pct = Math.round(Number(goal.progress) || 0);
  const history = list(goal.check_ins);
  const conf = text(goal, "confidence") || "On track";
  const historyHtml = history.length
    ? `<div class="list">${history.map((c) => { const cf = text(c, "confidence"); return `<article class="list-row"><span class="row-icon">${hrIcon("check", 18)}</span><div class="grow"><strong>${esc(String(Math.round(Number(c.previous_progress) || 0)))}% → ${esc(String(Math.round(Number(c.progress) || 0)))}%</strong><span class="t-meta">${esc(formatDay(text(c, "check_in_date")))}${text(c, "note") ? ` · ${esc(text(c, "note"))}` : ""}</span></div>${cf ? statusBadge(cf, confidenceTone(cf)) : ""}</article>`; }).join("")}</div>`
    : `<p class="t-meta">No check-ins yet.</p>`;
  return `<section class="stack-lg">
    <article class="card stack-sm">
      <span class="t-label">${esc(text(goal, "status") || "In Progress")}${text(goal, "end_date") ? ` · due ${esc(formatDay(text(goal, "end_date")))}` : ""}</span>
      <h2 class="t-title">${esc(text(goal, "goal_name"))}</h2>
      <div class="row-between"><span class="t-meta">Current progress</span><strong>${pct}%</strong></div>
      ${progressBar(pct)}
    </article>
    <form id="goal-checkin" class="card stack">
      <h2 class="t-title">New check-in</h2>
      <div class="field"><label for="gc-progress">Progress <output id="gc-out">${pct}%</output></label><input id="gc-progress" name="progress" type="range" min="0" max="100" step="5" value="${pct}"></div>
      ${field("Confidence", `<select name="confidence">${["On track", "At risk", "Off track"].map((v) => `<option${v === conf ? " selected" : ""}>${v}</option>`).join("")}</select>`)}
      ${field("What changed?", `<textarea name="note" maxlength="1000" placeholder="Wins, blockers, help you need"></textarea>`)}
      ${btn("Save check-in", { kind: "primary", block: true, attrs: 'type="submit"' })}
    </form>
    <div class="stack-sm">${sectionTitle("History")}${historyHtml}</div>
  </section>`;
}

function meetingRow(row: Row): string {
  const st = text(row, "status");
  const other = text(row, "role") === "manager" ? text(row, "employee_name") : text(row, "manager_name");
  return `<button type="button" class="list-row nav-row" data-meeting="${esc(text(row, "name"))}">${avatar(other || "?")}<div class="grow"><strong>${esc(other || "1-on-1")}</strong><span class="t-meta">${esc(formatDateTime(text(row, "scheduled_on")))}${text(row, "agenda") ? ` · ${esc(text(row, "agenda"))}` : ""}</span></div>${statusBadge(st, statusTone(st))}</button>`;
}

function meetingsScreen() {
  const upcoming = meetings.filter((m) => text(m, "status") === "Scheduled");
  const past = meetings.filter((m) => text(m, "status") !== "Scheduled");
  const withOptions = [meetingHasManager ? `<option value="">My manager</option>` : "", ...meetingReports.map((r) => `<option value="${esc(text(r, "name"))}">${esc(text(r, "employee_name"))}</option>`)].join("");
  const canSchedule = meetingHasManager || meetingReports.length > 0;
  return `<section class="stack-lg">
    <div class="stack-sm" data-live="upcoming">${sectionTitle("Upcoming")}${upcoming.length ? `<div class="list">${upcoming.map(meetingRow).join("")}</div>` : `<p class="t-meta">Nothing scheduled.</p>`}</div>
    ${canSchedule ? `<form id="meeting-form" class="card stack">
      <h2 class="t-title">Schedule a 1-on-1</h2>
      ${field("With", `<select name="employee">${withOptions}</select>`)}
      ${field("When", `<input name="when" type="datetime-local" required>`)}
      ${field("Agenda", `<textarea name="agenda" maxlength="2000" placeholder="What do you want to talk about?"></textarea>`)}
      ${btn("Schedule", { kind: "primary", block: true, attrs: 'type="submit"' })}
    </form>` : `<div class="banner info"><span>Ask HR to set your manager to schedule 1-on-1s.</span></div>`}
    <div class="stack-sm" data-live="past">${sectionTitle("Past")}${past.length ? `<div class="list">${past.map(meetingRow).join("")}</div>` : `<p class="t-meta">No past 1-on-1s.</p>`}</div>
  </section>`;
}

function meetingScreen() {
  const m = meetingDetail;
  if (!m || text(m, "name") !== meetingWanted) return `<div class="skeleton" aria-busy="true">${loadingSkeleton(5)}</div>`;
  const manager = text(m, "role") === "manager";
  const st = text(m, "status");
  const locked = st === "Cancelled";
  const other = manager ? text(m, "employee_name") : text(m, "manager_name");
  const items = list(m.action_items);
  const dis = locked ? " disabled data-locked" : "";
  const itemRows = items.map((a, i) => `<div class="action-row"><label class="check-row"><input type="checkbox" name="a_done_${i}"${Number(a.done) ? " checked" : ""}${dis}><span class="grow">${esc(text(a, "description"))}</span></label><input type="hidden" name="a_desc_${i}" value="${esc(text(a, "description"))}"><input type="hidden" name="a_owner_${i}" value="${esc(text(a, "owner_role") || "Employee")}"><input type="hidden" name="a_due_${i}" value="${esc(text(a, "due_date"))}"><span class="t-meta">${esc(text(a, "owner_role") === "Manager" ? (manager ? "You" : other) : (manager ? other : "You"))}${text(a, "due_date") ? ` · ${esc(formatDay(text(a, "due_date")))}` : ""}</span></div>`).join("");
  return `<section class="stack-lg">
    <article class="card stack-sm">
      <div class="row-between"><span class="t-label">${esc(formatDateTime(text(m, "scheduled_on")))}</span>${statusBadge(st, statusTone(st))}</div>
      <div class="row-start">${avatar(other || "?")}<div><h2 class="t-title">${esc(other)}</h2><span class="t-meta">${manager ? "Reports to you" : "Your manager"}</span></div></div>
    </article>
    <form id="meeting-edit" class="card stack" data-count="${items.length}">
      ${field("Agenda", `<textarea name="agenda" maxlength="2000"${dis}>${esc(text(m, "agenda"))}</textarea>`)}
      ${field("Shared notes", `<textarea name="shared_notes" maxlength="5000" placeholder="Both of you can see these"${dis}>${esc(text(m, "shared_notes"))}</textarea>`)}
      ${manager ? field("Private notes (only you)", `<textarea name="private_notes" maxlength="5000"${dis}>${esc(text(m, "manager_private_notes"))}</textarea>`) : ""}
      <div class="stack-sm"><p class="t-label">Action items</p>${itemRows || `<p class="t-meta">No action items yet.</p>`}</div>
      ${locked ? "" : `<div class="stack-sm new-action">${field("New action item", `<input name="new_desc" maxlength="240" placeholder="e.g. Share the supplier report">`)}<div class="grid-2">${field("Owner", `<select name="new_owner"><option value="Employee">${manager ? esc(other) : "Me"}</option><option value="Manager">${manager ? "Me" : esc(other)}</option></select>`)}${field("Due", `<input name="new_due" type="date">`)}</div></div>
      ${btn("Save", { kind: "primary", block: true, attrs: 'type="submit"' })}`}
    </form>
    ${manager && st === "Scheduled" ? `<div class="grid-2">${btn("Cancel meeting", { kind: "secondary", block: true, attrs: 'data-meeting-status="Cancelled"' })}${btn("Mark completed", { kind: "primary", block: true, attrs: 'data-meeting-status="Completed"' })}</div>` : ""}
  </section>`;
}

function pointRow(row: Row, given: boolean): string {
  const pending = Number(row.docstatus) === 0;
  const who = given ? `To ${text(row, "employee_name")}` : `From ${text(row, "given_by_name") || "HR"}`;
  const pts = Number(row.points) || 0;
  return `<article class="list-row"><span class="row-icon">${hrIcon("award", 18)}</span><div class="grow"><strong>${esc(who)}</strong><span class="t-meta">${esc(text(row, "category"))} · ${esc(text(row, "reason"))} · ${esc(formatDay(text(row, "creation")))}</span></div><div class="row-trail-stack"><strong class="${pts < 0 ? "neg" : "pos"}">${pts > 0 ? "+" : ""}${pts}</strong>${pending ? statusBadge(text(row, "status") || "Pending", "warning") : ""}</div></article>`;
}

function pointsScreen() {
  const settings = (pointsData.settings || {}) as Row;
  if (pointsData.settings && !Number(settings.enabled)) return emptyState(hrIcon("award", 26), "Bonus points are off", "HR has not switched on bonus points.");
  const balance = Number(pointsData.balance) || 0;
  const left = Number(pointsData.allowance_left) || 0;
  const maxEntry = Number(settings.max_per_entry) || 10;
  const redeemOn = text(settings, "redemption_mode") === "HR-approved redemption requests";
  const minRedeem = Math.max(Number(settings.min_redemption) || 1, 1);
  const cats = (Array.isArray(pointsData.categories) ? pointsData.categories : ["Teamwork"]).map((c) => `<option>${esc(String(c))}</option>`).join("");
  const people = colleagueResults.length
    ? `<div class="list">${colleagueResults.map((p, i) => `<label class="list-row pick-row"><input type="radio" form="points-give" name="employee" value="${esc(text(p, "name"))}"${i === 0 && colleagueResults.length === 1 ? " checked" : ""} required>${avatar(text(p, "employee_name"))}<div class="grow"><strong>${esc(text(p, "employee_name"))}</strong><span class="t-meta">${esc(text(p, "designation") || text(p, "department"))}</span></div></label>`).join("")}</div>`
    : `<p class="t-meta">${colleagueQuery ? "Nobody matched." : "Search for the colleague you want to thank."}</p>`;
  const received = list(pointsData.received);
  const given = list(pointsData.given);
  const redemptions = list(pointsData.redemptions);
  return `<section class="stack-lg">
    <article class="card stat-hero" data-live="hero"><p class="t-label">Your points</p><strong class="pay-amount">${balance}</strong><p class="t-meta">${left} of ${Number(settings.monthly_allowance) || 0} left to give this month${text(settings, "point_value_note") ? ` · ${esc(text(settings, "point_value_note"))}` : ""}</p></article>
    <div class="card stack">
      <h2 class="t-title">Thank a colleague</h2>
      <form id="colleague-search" class="search-bar" role="search">${icon("search", 18)}<input name="q" type="search" placeholder="Search by name" value="${esc(colleagueQuery)}" aria-label="Search colleagues"></form>
      <div data-live="colleagues">${people}</div>
      <form id="points-give" class="stack">
        <div class="grid-2">${field("Points", `<input name="points" type="number" min="1" max="${Math.min(maxEntry, Math.max(left, 1))}" value="${Math.max(1, Math.min(5, maxEntry, left))}" required${left ? "" : " disabled data-locked"}>`)}${field("For", `<select name="category">${cats}</select>`)}</div>
        ${field("Why?", `<textarea name="reason" required maxlength="500" placeholder="What did they do?"></textarea>`)}
        ${btn(`${hrIcon("award", 16)} Give points`, { kind: "primary", block: true, attrs: `type="submit"${left ? "" : " disabled data-locked"}` })}
        ${Number(settings.approval_above) ? `<p class="t-meta">Awards above ${Number(settings.approval_above)} points go to HR for approval.</p>` : ""}
      </form>
    </div>
    ${redeemOn ? `<form id="points-redeem" class="card stack">
      <h2 class="t-title">Redeem points</h2>
      <p class="t-meta">HR reviews each request and pays out by hand. Nothing is added to your salary automatically.</p>
      <div class="grid-2">${field("Points", `<input name="points" type="number" min="${minRedeem}" max="${Math.max(balance, minRedeem)}" value="${minRedeem}" required${balance >= minRedeem ? "" : " disabled data-locked"}>`)}<div></div></div>
      ${field("Note (optional)", `<input name="note" maxlength="500" placeholder="e.g. Shopping voucher">`)}
      ${btn("Request redemption", { kind: "secondary", block: true, attrs: `type="submit"${balance >= minRedeem ? "" : " disabled data-locked"}` })}
      ${balance >= minRedeem ? "" : `<p class="t-meta">You need at least ${minRedeem} points to redeem.</p>`}
    </form>` : ""}
    <div class="stack-sm" data-live="received">${sectionTitle("Received")}${received.length ? `<div class="list">${received.map((r) => pointRow(r, false)).join("")}</div>` : `<p class="t-meta">No points yet.</p>`}</div>
    <div class="stack-sm" data-live="given">${sectionTitle("Given")}${given.length ? `<div class="list">${given.map((r) => pointRow(r, true)).join("")}</div>` : `<p class="t-meta">You have not given points yet.</p>`}</div>
    <div class="stack-sm" data-live="redemptions"${redemptions.length ? "" : " hidden"}>${sectionTitle("Redemptions")}<div class="list">${redemptions.map((r) => { const st = text(r, "status"); return `<article class="list-row"><span class="row-icon">${hrIcon("wallet", 18)}</span><div class="grow"><strong>${esc(String(Number(r.points) || 0))} points</strong><span class="t-meta">${esc(formatDay(text(r, "creation")))}${text(r, "hr_note") ? ` · ${esc(text(r, "hr_note"))}` : ""}</span></div>${statusBadge(st, statusTone(st))}</article>`; }).join("")}</div></div>
  </section>`;
}

/** Keep the give / redeem limits and locked states in step with a refreshed balance. */
function syncPointLimits() {
  const settings = (pointsData.settings || {}) as Row;
  const left = Number(pointsData.allowance_left) || 0;
  const balance = Number(pointsData.balance) || 0;
  const maxEntry = Number(settings.max_per_entry) || 10;
  const minRedeem = Math.max(Number(settings.min_redemption) || 1, 1);
  const setLock = (el: HTMLInputElement | HTMLButtonElement | null, locked: boolean) => {
    if (!el) return;
    if (locked) el.setAttribute("data-locked", ""); else el.removeAttribute("data-locked");
    el.disabled = locked || Boolean(ssBusy);
  };
  const give = document.querySelector<HTMLInputElement>('#points-give input[name="points"]');
  if (give) { give.max = String(Math.min(maxEntry, Math.max(left, 1))); if (Number(give.value) > Number(give.max)) give.value = give.max; }
  setLock(give, !left);
  setLock(document.querySelector<HTMLButtonElement>('#points-give button[type="submit"]'), !left);
  const redeem = document.querySelector<HTMLInputElement>('#points-redeem input[name="points"]');
  if (redeem) redeem.max = String(Math.max(balance, minRedeem));
  setLock(redeem, balance < minRedeem);
  setLock(document.querySelector<HTMLButtonElement>('#points-redeem button[type="submit"]'), balance < minRedeem);
}

async function loadMeeting(name: string) {
  if (previewMode || !api) { render("meeting"); return; }
  try {
    const data = await payload(await api.getOneOnOne({ name }));
    if (meetingWanted !== name) return;
    meetingDetail = data;
  } catch (error) {
    if (meetingWanted === name) setToast(error instanceof Error ? error.message : "Could not open the 1-on-1", "danger");
  }
  if (screen === "meeting" && meetingWanted === name) render("meeting");
}

async function refreshPoints() {
  try { pointsData = await payload(await api!.getPoints()); } catch { /* next open */ }
}

/** Row bindings inside [data-live] sections (idempotent, rebound after patchLiveParts). */
function bindTalentRows() {
  document.querySelectorAll<HTMLButtonElement>("[data-goal]").forEach((button) => {
    button.onclick = () => { goalWanted = button.dataset.goal || ""; render("goal"); };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-meeting]").forEach((button) => {
    button.onclick = () => { meetingDetail = null; meetingWanted = button.dataset.meeting || ""; render("meeting"); void loadMeeting(meetingWanted); };
  });
}

function meetingActions(form: HTMLFormElement): Row[] {
  const data = new FormData(form);
  const count = Number(form.dataset.count) || 0;
  const items: Row[] = [];
  for (let i = 0; i < count; i += 1) {
    items.push({ description: String(data.get(`a_desc_${i}`) || ""), owner_role: String(data.get(`a_owner_${i}`) || "Employee"), due_date: String(data.get(`a_due_${i}`) || "") || null, done: data.get(`a_done_${i}`) ? 1 : 0 });
  }
  const fresh = String(data.get("new_desc") || "").trim();
  if (fresh) items.push({ description: fresh, owner_role: String(data.get("new_owner") || "Employee"), due_date: String(data.get("new_due") || "") || null, done: 0 });
  return items;
}

function bindTalent() {
  bindTalentRows();
  const range = document.querySelector<HTMLInputElement>("#gc-progress");
  const out = document.querySelector<HTMLOutputElement>("#gc-out");
  if (range && out) range.oninput = () => { out.textContent = `${range.value}%`; };
  document.querySelector<HTMLFormElement>("#goal-checkin")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const goal = goalWanted;
    void runSelfService("Saving", async () => {
      await payload(await api!.goalCheckIn({ goal, progress: Number(data.get("progress")), confidence: String(data.get("confidence") || "On track"), note: String(data.get("note") || "") }));
      setToast("Check-in saved", "success");
      try { goals = list((await payload(await api!.getGoals())).goals); } catch { /* next open */ }
    }, "goal");
  });
  document.querySelector<HTMLFormElement>("#meeting-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const when = String(data.get("when") || "");
    void runSelfService("Scheduling", async () => {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when)) throw new Error("Pick a date and time.");
      const saved = await payload(await api!.scheduleOneOnOne({ employee: String(data.get("employee") || ""), scheduled_on: `${when.replace("T", " ").slice(0, 16)}:00`, agenda: String(data.get("agenda") || "") }));
      setToast(`1-on-1 ${text(saved, "name")} scheduled`, "success");
      try { const fresh = await payload(await api!.getOneOnOnes()); meetings = list(fresh.meetings); meetingReports = list(fresh.reports); } catch { /* next open */ }
    }, "meetings");
  });
  document.querySelector<HTMLFormElement>("#meeting-edit")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const name = meetingWanted;
    const manager = text(meetingDetail || {}, "role") === "manager";
    const body: Record<string, unknown> = { name, agenda: String(data.get("agenda") || ""), shared_notes: String(data.get("shared_notes") || ""), actions: meetingActions(form), modified: text(meetingDetail || {}, "modified") };
    if (manager) body.private_notes = String(data.get("private_notes") || "");
    void runSelfService("Saving", async () => {
      const saved = await payload(await api!.updateOneOnOne(body));
      if (meetingWanted === name) meetingDetail = saved;
      setToast("1-on-1 saved", "success");
    }, "meeting");
  });
  document.querySelectorAll<HTMLButtonElement>("[data-meeting-status]").forEach((button) => {
    button.onclick = () => {
      const name = meetingWanted;
      const status = button.dataset.meetingStatus || "";
      const form = document.querySelector<HTMLFormElement>("#meeting-edit");
      // Save whatever is in the form together with the status so unsaved notes are not lost.
      const body: Record<string, unknown> = { name, status, modified: text(meetingDetail || {}, "modified") };
      if (form) {
        const data = new FormData(form);
        Object.assign(body, { agenda: String(data.get("agenda") || ""), shared_notes: String(data.get("shared_notes") || ""), actions: meetingActions(form), private_notes: String(data.get("private_notes") || "") });
        lastSubmittedForm = form;
      }
      void runSelfService("Updating", async () => {
        const saved = await payload(await api!.updateOneOnOne(body));
        if (meetingWanted === name) meetingDetail = saved;
        meetings = meetings.map((m) => (text(m, "name") === name ? { ...m, status } : m));
        setToast(status === "Completed" ? "Marked completed" : "1-on-1 cancelled", "success");
      }, "meeting");
    };
  });
  document.querySelector<HTMLFormElement>("#colleague-search")?.addEventListener("submit", (event) => {
    event.preventDefault();
    colleagueQuery = String(new FormData(event.currentTarget as HTMLFormElement).get("q") || "").trim().slice(0, 60);
    if (previewMode || !api) { patchLiveParts("points"); return; }
    const asked = colleagueQuery;
    void (async () => {
      try {
        const rows = list(await payload(await api!.searchColleagues({ query: asked })));
        if (asked !== colleagueQuery) return;
        colleagueResults = rows;
      } catch (error) { setToast(error instanceof Error ? error.message : "Search failed", "danger"); return; }
      if (screen === "points") patchLiveParts("points");
    })();
  });
  document.querySelector<HTMLFormElement>("#points-give")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const employee = String(data.get("employee") || "");
    void runSelfService("Sending", async () => {
      if (!employee) throw new Error("Pick the colleague first.");
      const saved = await payload(await api!.givePoints({ employee, points: Number(data.get("points")), category: String(data.get("category") || "Teamwork"), reason: String(data.get("reason") || "") }));
      setToast(text(saved, "status") === "Pending Approval" ? "Sent to HR for approval" : "Points given. Thank you!", "success");
      colleagueResults = []; colleagueQuery = "";
      await refreshPoints();
    }, "points");
  });
  document.querySelector<HTMLFormElement>("#points-redeem")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    void runSelfService("Sending", async () => {
      const saved = await payload(await api!.requestRedemption({ points: Number(data.get("points")), note: String(data.get("note") || "") }));
      setToast(`Request ${text(saved, "name")} sent to HR`, "success");
      await refreshPoints();
    }, "points");
  });
}

function bindHrOps() {
  bindLiveRows();
  document.querySelector<HTMLFormElement>("#faq-search")?.addEventListener("submit", (event) => {
    event.preventDefault();
    helpQuery = String(new FormData(event.currentTarget as HTMLFormElement).get("q") || "").trim().slice(0, 100);
    if (previewMode || !api) { render("help"); return; }
    const asked = helpQuery;
    void (async () => {
      try {
        const data = await payload(await api!.getHelp({ query: asked }));
        if (asked !== helpQuery) return; // a newer search is on its way
        helpData = data;
      } catch (error) { setToast(error instanceof Error ? error.message : "Search failed", "danger"); return; }
      // Only the answers and ticket list are refreshed, so a half-written ticket stays as typed.
      if (screen === "help") patchLiveParts("help");
    })();
  });
  document.querySelector<HTMLFormElement>("#ticket-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    void runSelfService("Sending", async () => {
      const saved = await payload(await api!.createTicket({ subject: String(data.get("subject") || ""), category: String(data.get("category") || ""), priority: String(data.get("priority") || "Medium"), description: String(data.get("description") || "") }));
      setToast(`Ticket ${text(saved, "name")} sent to HR`, "success");
      try { helpData = await payload(await api!.getHelp({ query: helpQuery })); } catch { /* next open */ }
    }, "help");
  });
  document.querySelector<HTMLFormElement>("#ticket-reply")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = text((ticketDetail?.ticket || {}) as Row, "name");
    const message = String(new FormData(event.currentTarget as HTMLFormElement).get("message") || "");
    void runSelfService("Sending", async () => {
      await payload(await api!.addTicketComment({ name, message }));
      setToast("Reply sent", "success");
      await loadTicketData(name);
    }, "ticket");
  });
  document.querySelectorAll<HTMLButtonElement>("[data-ticket-action], [data-rate]").forEach((button) => {
    button.onclick = () => {
      const name = text((ticketDetail?.ticket || {}) as Row, "name");
      const action = button.dataset.rate ? "rate" : button.dataset.ticketAction || "";
      void runSelfService("Updating", async () => {
        await payload(await api!.ticketAction({ name, action, rating: button.dataset.rate ? Number(button.dataset.rate) : undefined }));
        setToast(action === "rate" ? "Thanks for the rating" : action === "close" ? "Ticket closed" : "Ticket reopened", "success");
        await loadTicketData(name);
      }, "ticket");
    };
  });
  const readBox = document.querySelector<HTMLInputElement>("#policy-read");
  const ackButton = document.querySelector<HTMLButtonElement>("#policy-ack");
  if (readBox && ackButton) {
    readBox.onchange = () => { ackButton.disabled = !readBox.checked || Boolean(ssBusy); };
    ackButton.onclick = () => {
      const doc = policyDetail || {};
      void runSelfService("Saving", async () => {
        await payload(await api!.acknowledgePolicy({ name: text(doc, "name"), policy_version: Number(doc.policy_version) || 1 }));
        if (policyWanted === text(doc, "name") || !policyWanted) policyDetail = { ...doc, acknowledged: true };
        policies = policies.map((row) => (text(row, "name") === text(doc, "name") ? { ...row, acknowledged: true, pending: false } : row));
        policyPending = policies.filter((row) => row.pending).length;
        setToast("Policy acknowledged", "success");
      }, "policy");
    };
  }
  const policyFile = document.querySelector<HTMLButtonElement>("#policy-file");
  if (policyFile) {
    policyFile.onclick = () => {
      const name = text(policyDetail || {}, "name");
      if (previewMode || !api) { setToast("Attachments open on a connected phone", "info"); return; }
      void runSelfService("Opening document", async () => {
        const file = await raceWithTimeout(async () => payload(await api!.getPolicyAttachment({ name })), 60_000, "The document took too long. Try again.");
        await saveFile(text(file, "filename") || `${name}.pdf`, text(file, "content"));
      }, "policy");
    };
  }
  document.querySelector<HTMLFormElement>("#letter-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    void runSelfService("Sending", async () => {
      const saved = await payload(await api!.createLetterRequest({ document_type: String(data.get("documentType") || ""), addressed_to: String(data.get("addressedTo") || ""), purpose: String(data.get("purpose") || "") }));
      setToast(`Request ${text(saved, "name")} sent to HR`, "success");
      try { const fresh = await payload(await api!.getDocumentRequests()); docRequests = list(fresh.requests); } catch { /* next open */ }
    }, "requests");
  });
  document.querySelector<HTMLFormElement>("#asset-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    void runSelfService("Sending", async () => {
      const saved = await payload(await api!.createAssetRequest({ request_type: String(data.get("requestType") || "Request"), item_description: String(data.get("item") || ""), asset: String(data.get("asset") || ""), needed_by: String(data.get("neededBy") || ""), reason: String(data.get("reason") || "") }));
      setToast(`Request ${text(saved, "name")} sent to HR`, "success");
      try { const fresh = await payload(await api!.getAssets()); myAssets = list(fresh.assets); assetRequests = list(fresh.requests); } catch { /* next open */ }
    }, "assets");
  });
  document.querySelectorAll<HTMLFormElement>("[data-notice]").forEach((form) => {
    form.onsubmit = (event) => {
      event.preventDefault();
      const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
      const action = submitter?.dataset.noticeAction || "acknowledge";
      const name = form.dataset.notice || "";
      const response = String(new FormData(form).get("response") || "");
      if (action === "appeal" && !response.trim()) { setToast("Write your response to appeal.", "warn"); return; }
      void runSelfService("Saving", async () => {
        const saved = await payload(await api!.respondDisciplinary({ name, action, response }));
        notices = notices.map((row) => (text(row, "name") === name ? { ...row, status: text(saved, "status"), employee_response: response.trim() || row.employee_response } : row));
        noticesPending = notices.filter((row) => text(row, "status") === "Issued").length;
        setToast(action === "appeal" ? "Appeal sent to HR" : "Notice acknowledged", "success");
      }, "notices");
    };
  });
}

async function loadTicketData(name: string) {
  try {
    const data = await payload(await api!.getTicket({ name }));
    if (ticketWanted === name) ticketDetail = data;
  } catch { /* keep current */ }
}

async function loadTicket(name: string) {
  if (previewMode || !api) { render("ticket"); return; }
  try {
    const data = await payload(await api.getTicket({ name }));
    if (ticketWanted !== name) return; // the employee opened another ticket meanwhile
    ticketDetail = data;
  } catch (error) {
    if (ticketWanted === name) setToast(error instanceof Error ? error.message : "Could not open the ticket", "danger");
  }
  if (screen === "ticket" && ticketWanted === name) render("ticket");
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
  const pages: Record<Screen, () => string> = { home, attendance, calendar: calendarScreen, leave, pay, enroll, profile, approvals: approvalsScreen, expenses: expensesScreen, notifications: notificationsScreen, editprofile: editProfileScreen, documents: documentsScreen, help: helpScreen, ticket: ticketScreen, policies: policiesScreen, policy: policyScreen, requests: requestsScreen, assets: assetsScreen, notices: noticesScreen, goals: goalsScreen, goal: goalScreen, meetings: meetingsScreen, meeting: meetingScreen, points: pointsScreen };
  // Exactly 5 tabs — never Enroll in the bar (wraps on ~360px / real phones). Enroll stays manager-only via Home tile + Profile.
  const nav: Array<{ id: Screen; label: string; icon: string }> = [
    { id: "home", label: "Home", icon: icon("home", 22) },
    { id: "attendance", label: "Attend", icon: icon("map-pin", 22) },
    { id: "leave", label: "Leave", icon: icon("calendar", 22) },
    { id: "pay", label: "Pay", icon: icon("credit-card", 22) },
    { id: "profile", label: "Profile", icon: icon("user", 22) },
  ];
  if (!isManager() && screen === "enroll") screen = "home";
  const navActive: Screen = screen === "enroll" || screen === "editprofile" || screen === "documents" ? "profile" : screen === "calendar" ? "attendance" : ["approvals", "expenses", "notifications", "help", "ticket", "policies", "policy", "requests", "assets", "notices", "goals", "goal", "meetings", "meeting", "points"].includes(screen) ? "home" : screen;
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
  bindHrOps();
  bindTalent();
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
