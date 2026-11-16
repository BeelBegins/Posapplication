import { App } from "@capacitor/app";
import { Geolocation } from "@capacitor/geolocation";
import { createHrApi } from "../../api/hr";
import { createApiClient } from "../../api/client";
import { normalizeErpDisplayText } from "../../core/display-branding";
import { capacitorOAuthBrowser } from "../../mobile/capacitor-oauth-browser";
import { OAuthPkceCredentialProvider, type OAuthPublicClientConfig } from "../../mobile/credential-provider";
import { androidSecureStorage } from "../../mobile/secure-storage";
import { bottomNavigation, emptyState, escapeHtml as esc, formatMoney, icon } from "../shared/ui";
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
type HrApi = ReturnType<typeof createHrApi>;

const root = document.querySelector<HTMLElement>("#app")!;
const fetcher = globalThis.fetch.bind(globalThis);
const configKey = "aimatic-hr-config-v1";
let config: OAuthPublicClientConfig | null = null;
let credentials: OAuthPkceCredentialProvider | null = null;
let api: HrApi | null = null;
let context: Row = {};
let screen: Screen = "home";
let message = "";
let tone = "";
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
let cameraOpen = false;
let cameraStarting = false;
let activeStream: MediaStream | null = null;
let backListenerReady = false;

const text = (row: Row | undefined, ...keys: string[]) => {
  for (const key of keys) if (row?.[key] != null && row[key] !== "") return String(row[key]);
  return "";
};
const list = (value: unknown): Row[] => Array.isArray(value) ? value.filter((entry): entry is Row => Boolean(entry) && typeof entry === "object") : [];
const money = (value: unknown) => formatMoney(value, "PKR");
const isManager = () => canManageFaceEnrollment(context.roles);
const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;

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

async function ensureBackHandler(): Promise<void> {
  if (backListenerReady) return;
  backListenerReady = true;
  try {
    await App.addListener("backButton", () => {
      if (cameraOpen || cameraStarting) {
        stopCamera();
        message = "Camera closed";
        tone = "warning";
        render("enroll");
        return;
      }
      if (screen === "enroll") {
        message = "";
        tone = "";
        render("home");
        return;
      }
      if (screen !== "home") {
        render("home");
        return;
      }
      void App.exitApp();
    });
  } catch {
    // Browser / non-Capacitor shells have no native back hook.
  }
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
  root.innerHTML = `<section class="setup"><div class="setup-card"><div class="mark">HR</div><p class="eyebrow">Employee app</p><h1>Ai Matic HR</h1><p>Sign in with your ERP employee account. Attendance, leave and pay stay on the server.</p>${error ? `<p class="alert danger">${esc(error)}</p>` : ""}<form id="setup"><label>ERP URL<input id="url" type="url" required placeholder="https://erp.example.com" autocomplete="url"></label><button class="primary">Continue</button></form><small>v${esc(__APP_VERSION__)} · No API key or secret</small></div></section>`;
  document.querySelector<HTMLFormElement>("#setup")!.onsubmit = async (event) => {
    event.preventDefault();
    try { await configure(document.querySelector<HTMLInputElement>("#url")!.value); signIn(); }
    catch (reason) { setup(reason instanceof Error ? reason.message : "Connection failed"); }
  };
}

function signIn() {
  stopCamera();
  root.innerHTML = `<section class="setup"><div class="setup-card"><div class="mark">HR</div><p class="eyebrow">Secure access</p><h1>Employee sign in</h1><p>Use your own ERP account. The app cannot choose another employee.</p>${message ? `<p class="alert danger">${esc(message)}</p>` : ""}<button id="login" class="primary">Sign in with ERP</button><button id="change-server" class="secondary">Change ERP server</button></div></section>`;
  document.querySelector<HTMLButtonElement>("#login")!.onclick = async () => {
    try { await credentials!.login(); await loadContext(); }
    catch (error) { message = error instanceof Error ? error.message : "Sign in failed"; signIn(); }
  };
  document.querySelector<HTMLButtonElement>("#change-server")!.onclick = () => { localStorage.removeItem(configKey); config = null; setup(); };
}

async function loadContext() {
  loading = "Loading your HR workspace";
  render();
  context = await payload(await api!.getContext());
  facePolicy = (context.face_policy && typeof context.face_policy === "object" ? context.face_policy : {}) as Row;
  loading = "";
  message = "";
  render("home");
  void refresh();
}

async function refresh() {
  if (!api) return;
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
    message = error instanceof Error ? error.message : "Could not refresh HR data";
    tone = "danger";
    render(screen);
  }
}

function rows(items: Row[], title: (row: Row) => string, detail: (row: Row) => string) {
  if (!items.length) return emptyState(icon("list", 28), "Nothing here yet", "Records from ERP will appear after the server returns them.");
  return `<div class="stack">${items.map((row) => `<article class="row"><strong>${esc(title(row))}</strong><small>${esc(detail(row))}</small></article>`).join("")}</div>`;
}

function home() {
  const balanceCards = Object.entries(balances).slice(0, 4).map(([name, value]) => {
    const row = value && typeof value === "object" ? value as Row : {};
    return `<article class="tile"><strong>${esc(name)}</strong><small>${esc(row.balance_leaves ?? "-")} days left</small></article>`;
  }).join("");
  const managerCue = isManager()
    ? `<button class="secondary" data-screen="enroll">Enroll employee face</button>`
    : "";
  return `<section class="stack"><article class="tile"><p class="eyebrow">Today</p><h2>${esc(text(context, "employee_name") || "Employee")}</h2><small>${esc([text(context, "designation"), text(context, "department")].filter(Boolean).join(" · "))}</small><p>${context.verifier_ready ? "Face verification is ready." : "Face verification is required and not configured yet. Check-in will stay blocked."}</p><button class="primary" data-screen="attendance">Open attendance</button>${managerCue}</article><div class="grid">${balanceCards || `<article class="tile"><strong>Leave</strong><small>No balance returned</small></article>`}<article class="tile"><strong>${esc(String(team.length))}</strong><small>People reporting to you</small></article></div><button class="secondary" id="refresh">Refresh</button></section>`;
}

function attendance() {
  return `<section class="stack"><article class="tile"><p class="eyebrow">Live attendance</p><h2>Check in or out</h2><p>The server records the time, employee and face result. This phone only sends location, a one-time challenge and a camera frame.</p>${previewUrl ? `<img class="camera" alt="Live face preview" src="${esc(previewUrl)}">` : ""}<p id="liveness" class="prompt" hidden></p><div class="actions"><button class="primary" data-log="IN">Check in</button><button class="secondary" data-log="OUT">Check out</button></div></article>${rows(checkins, (row) => `${text(row, "log_type") || "Log"} · ${text(row, "time")}`, (row) => text(row, "shift") || "Recorded by ERP")}</section>`;
}

function leave() {
  const typeOptions = (Array.isArray(options.leave_types) ? options.leave_types : []).map((entry) => `<option>${esc(String(entry))}</option>`).join("");
  return `<section class="stack"><form id="leave" class="tile"><p class="eyebrow">Request leave</p><label>Leave type<select name="leaveType" required>${typeOptions || "<option value=''>No allocated leave</option>"}</select></label><label>From<input name="fromDate" type="date" required></label><label>To<input name="toDate" type="date" required></label><label>Note<textarea name="description"></textarea></label><button class="primary">Submit to ERP</button></form>${rows(leaveRows, (row) => `${text(row, "leave_type")} · ${text(row, "status")}`, (row) => `${text(row, "from_date")} to ${text(row, "to_date")}`)}</section>`;
}

function pay() {
  return rows(payslips, (row) => `${text(row, "name")} · ${money(row.net_pay)}`, (row) => `${text(row, "start_date")} to ${text(row, "end_date")}`);
}

function enroll() {
  if (!isManager()) {
    return emptyState(icon("user", 28), "Managers only", "Face enrollment is limited to HR Manager or System Manager.");
  }
  const selected = directory.find((row) => text(row, "name") === enrollEmployee);
  const picks = directory.slice(0, 40).map((row) => {
    const id = text(row, "name");
    const active = id === enrollEmployee ? " active" : "";
    return `<button type="button" class="row pick${active}" data-employee="${esc(id)}" aria-pressed="${id === enrollEmployee ? "true" : "false"}"><strong>${esc(text(row, "employee_name") || id)}</strong><small>${esc([id, text(row, "designation"), text(row, "department")].filter(Boolean).join(" · "))}</small></button>`;
  }).join("");
  const thumbs = enrollCaptures.map((image, index) => `
    <div class="thumb-wrap">
      <img class="thumb" alt="Capture ${index + 1}" src="${esc(image)}">
      <div class="thumb-actions"><button type="button" data-retake="${index}" aria-label="Remove photo ${index + 1}">Remove</button></div>
    </div>`).join("");
  const policyVersion = text(facePolicy, "consent_version") || FACE_CONSENT_VERSION;
  const ready = canSubmitEnrollment({ employee: enrollEmployee, images: enrollCaptures, consent: enrollConsent, busy: enrollBusy });
  const prompt = enrollmentPromptForIndex(enrollCaptures.length);
  const stage = cameraOpen || cameraStarting
    ? `<div class="stage" aria-live="polite">
        <video id="enroll-video" playsinline muted autoplay></video>
        <div class="oval" aria-hidden="true"></div>
        <div class="stage-meta"><span>${esc(prompt)}</span><span>${enrollCaptures.length}/5</span></div>
      </div>`
    : previewUrl
      ? `<div class="stage"><img class="preview" alt="Last capture preview" src="${esc(previewUrl)}"><div class="oval" aria-hidden="true"></div></div>`
      : `<div class="stage"><div class="stage-meta"><span>Camera closed</span><span>${enrollCaptures.length}/5</span></div></div>`;

  return `<section class="stack ${enrollBusy ? "busy" : ""}">
    <article class="tile">
      <p class="eyebrow">HR enrollment</p>
      <h2>Enroll face template</h2>
      <p>Use the live camera only. Completing enrollment also finishes an existing Pending record for the same employee (for example HR-EMP-00063).</p>
      <ul class="tips">
        <li>Face a light source; avoid strong backlight.</li>
        <li>Keep the camera at eye level and center your face in the oval.</li>
        <li>Remove glare glasses if they hide the eyes.</li>
        <li>Capture 3 to 5 live photos. Raw images are not kept after the encrypted template is saved.</li>
      </ul>
      <form id="enroll-search" class="stack">
        <label for="enroll-query">Find employee</label>
        <input id="enroll-query" value="${esc(enrollQuery)}" placeholder="Name, code, or department" autocomplete="off">
        <button class="secondary" ${enrollSearching || enrollBusy ? "disabled" : ""}>${enrollSearching ? "Searching…" : "Search directory"}</button>
      </form>
      <div class="stack picks">${picks || emptyState(icon("search", 28), "No employees yet", "Search the directory, then tap an employee to enroll.")}</div>
      ${selected ? `<p class="eyebrow">Selected</p><strong>${esc(text(selected, "employee_name"))}</strong><small>${esc(text(selected, "name"))}</small>` : `<p class="alert warning">Pick an employee before capturing photos.</p>`}
      <p class="prompt" id="liveness">${esc(prompt)}</p>
      ${stage}
      <div class="actions">
        <button class="secondary" id="open-camera" ${enrollBusy || !enrollEmployee || enrollCaptures.length >= 5 ? "disabled" : ""}>${cameraOpen || cameraStarting ? "Camera on" : "Open camera"}</button>
        <button class="primary" id="capture-enroll" ${enrollBusy || !cameraOpen || enrollCaptures.length >= 5 ? "disabled" : ""}>Take photo (${enrollCaptures.length}/5)</button>
      </div>
      <div class="actions">
        <button class="secondary" id="retake-last" ${enrollBusy || !enrollCaptures.length ? "disabled" : ""}>Remove last</button>
        <button class="secondary" id="clear-enroll" ${enrollBusy || !enrollCaptures.length ? "disabled" : ""}>Clear all</button>
      </div>
      <div class="thumbs">${thumbs || `<p class="alert">No photos yet. Open the camera and take at least 3.</p>`}</div>
      <button type="button" class="consent-row" id="enroll-consent-toggle" aria-pressed="${enrollConsent ? "true" : "false"}">
        <span class="consent-box" aria-hidden="true">${enrollConsent ? "✓" : ""}</span>
        <span>I confirm the employee consented to face verification for attendance check-in/out under policy <code>${esc(policyVersion)}</code>.
          <small>Only an encrypted template is stored. Raw photos are not kept. An HR manager can revoke and wipe later.</small>
        </span>
      </button>
      <button class="primary" id="submit-enroll" ${ready ? "" : "disabled"}>${enrollBusy ? "Enrolling…" : "Complete enrollment"}</button>
      <button class="secondary" id="close-camera" ${cameraOpen || cameraStarting ? "" : "disabled"}>Close camera</button>
    </article>
  </section>`;
}

function profile() {
  const requestCards = ["attendance", "expenses", "shifts"].map((key) => {
    const items = list(requests[key]);
    return `<article class="tile"><strong>${esc(key)}</strong><small>${items.length} record${items.length === 1 ? "" : "s"}</small></article>`;
  }).join("");
  const enrollHint = isManager()
    ? `<button class="secondary" data-screen="enroll">Open face enrollment</button>`
    : `<p>Face enrolled: ${context.face_enrolled ? "yes" : "no"}. A manager enrolls the template in this app. Enrollment photos are not stored on the phone.</p>`;
  return `<section class="stack"><article class="tile"><h2>${esc(text(context, "employee_name"))}</h2><small>${esc(text(context, "employee"))} · ${esc(text(context, "company"))}</small>${enrollHint}<button id="sign-out" class="secondary">Sign out</button></article><div class="grid">${requestCards}</div><h2>Team</h2>${rows(team, (row) => text(row, "employee_name"), (row) => text(row, "designation") || text(row, "department"))}<form id="correction" class="tile"><p class="eyebrow">Attendance request</p><label>Reason<select name="reason"><option>Work From Home</option><option>On Duty</option></select></label><label>From<input name="fromDate" type="date" required></label><label>To<input name="toDate" type="date" required></label><label>Explanation<textarea name="explanation"></textarea></label><button class="primary">Send request</button></form></section>`;
}

function render(next: Screen = screen) {
  if (next !== "enroll" && (cameraOpen || cameraStarting)) stopCamera();
  screen = next;
  if (loading) {
    root.innerHTML = `<section class="setup"><div class="setup-card"><p>${esc(loading)}</p></div></section>`;
    return;
  }
  const pages: Record<Screen, () => string> = { home, attendance, leave, pay, enroll, profile };
  const nav = [
    { id: "home", label: "Home", icon: icon("home", 22) },
    { id: "attendance", label: "Attend", icon: icon("map-pin", 22) },
    { id: "leave", label: "Leave", icon: icon("list", 22) },
    { id: "pay", label: "Pay", icon: icon("credit-card", 22) },
    ...(isManager() ? [{ id: "enroll", label: "Enroll", icon: icon("user", 22) }] : []),
    { id: "profile", label: "Profile", icon: icon("user", 22) },
  ];
  if (!isManager() && screen === "enroll") screen = "home";
  root.innerHTML = `<section class="shell"><header class="top"><div><strong>Ai Matic HR</strong><small>${esc(text(context, "employee_name") || "Not signed in")}</small></div></header><main class="page">${message ? `<p class="alert ${esc(tone || "warning")}" role="status">${esc(message)}</p>` : ""}${pages[screen]()}</main>${bottomNavigation("HR", screen, nav)}</section>`;
  bind();
  if (screen === "enroll" && cameraOpen && activeStream) attachPreview(activeStream);
  void ensureBackHandler();
}

function attachPreview(stream: MediaStream): void {
  const video = document.querySelector<HTMLVideoElement>("#enroll-video");
  if (!video) return;
  video.srcObject = stream;
  void video.play().catch(() => {
    message = "Could not start the live preview. Tap Open camera again.";
    tone = "danger";
  });
}

function bind() {
  document.querySelectorAll<HTMLButtonElement>("[data-screen]").forEach((button) => {
    button.onclick = () => {
      message = "";
      tone = "";
      if (button.dataset.screen !== "enroll") stopCamera();
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
      message = `Selected ${enrollEmployee}`;
      tone = "success";
      render("enroll");
    };
  });
  document.querySelector<HTMLButtonElement>("#enroll-consent-toggle")?.addEventListener("click", () => {
    enrollConsent = !enrollConsent;
    render("enroll");
  });
  document.querySelector<HTMLButtonElement>("#open-camera")?.addEventListener("click", () => void openEnrollmentCamera());
  document.querySelector<HTMLButtonElement>("#close-camera")?.addEventListener("click", () => {
    stopCamera();
    message = "Camera closed";
    tone = "warning";
    render("enroll");
  });
  document.querySelector<HTMLButtonElement>("#capture-enroll")?.addEventListener("click", () => void captureEnrollmentPhoto());
  document.querySelector<HTMLButtonElement>("#retake-last")?.addEventListener("click", () => {
    enrollCaptures = enrollCaptures.slice(0, -1);
    previewUrl = enrollCaptures[enrollCaptures.length - 1] || "";
    message = enrollCaptures.length ? `Removed last photo. ${enrollCaptures.length}/5 kept.` : "All photos cleared.";
    tone = "warning";
    render("enroll");
  });
  document.querySelectorAll<HTMLButtonElement>("[data-retake]").forEach((button) => {
    button.onclick = () => {
      const index = Number(button.dataset.retake);
      if (!Number.isInteger(index)) return;
      enrollCaptures = enrollCaptures.filter((_, i) => i !== index);
      previewUrl = enrollCaptures[enrollCaptures.length - 1] || "";
      message = `Removed photo ${index + 1}. ${enrollCaptures.length}/5 kept.`;
      tone = "warning";
      render("enroll");
    };
  });
  document.querySelector<HTMLButtonElement>("#clear-enroll")?.addEventListener("click", () => {
    enrollCaptures = [];
    previewUrl = "";
    message = "All enrollment photos cleared.";
    tone = "warning";
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
    setup();
  });
}

async function searchDirectory(event: Event) {
  event.preventDefault();
  if (!api || !isManager() || enrollBusy) return;
  enrollQuery = document.querySelector<HTMLInputElement>("#enroll-query")?.value.trim() || "";
  enrollSearching = true;
  render("enroll");
  try {
    if (offline()) throw new Error("You appear offline. Reconnect, then search again.");
    directory = list(await payload(await api.getDirectory(enrollQuery)));
    message = directory.length ? `Found ${directory.length} employee${directory.length === 1 ? "" : "s"}` : "No employees matched";
    tone = directory.length ? "success" : "warning";
  } catch (error) {
    message = error instanceof Error ? error.message : "Directory search failed";
    tone = "danger";
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
  if (!enrollEmployee) {
    message = "Pick an employee before opening the camera.";
    tone = "warning";
    render("enroll");
    return;
  }
  if (enrollCaptures.length >= 5) return;
  cameraStarting = true;
  message = "This app needs the camera to capture live enrollment photos.";
  tone = "warning";
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
    message = enrollmentPromptForIndex(enrollCaptures.length);
    tone = "success";
    render("enroll");
  } catch (error) {
    stopCamera();
    message = cameraPermissionDeniedMessage(error) || (error instanceof Error ? error.message : "Camera could not start");
    tone = "danger";
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
      const cleanup = () => {
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("error", onError);
      };
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
    if (note) {
      note.hidden = false;
      note.textContent = prompt;
    }
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
    message = `Captured photo ${enrollCaptures.length} of 5. ${enrollCaptures.length < 3 ? "Take at least 3." : "You can submit when consent is checked."}`;
    tone = "success";
    if (enrollCaptures.length >= 5) stopCamera();
    render("enroll");
  } catch (error) {
    message = cameraPermissionDeniedMessage(error) || (error instanceof Error ? error.message : "Camera capture failed");
    tone = "danger";
    render("enroll");
  }
}

async function submitEnrollment() {
  if (!api || !isManager() || enrollBusy) return;
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
    message = "Submitting enrollment to ERP…";
    tone = "warning";
    render("enroll");
    const saved = await payload(await api.enrollFace(body));
    enrollCaptures = [];
    enrollConsent = false;
    previewUrl = "";
    message = `Enrollment complete for ${enrollEmployee}. Status: ${text(saved, "status") || "Enrolled"} (${text(saved, "name") || "saved"}).`;
    tone = "success";
    context = await payload(await api.getContext());
  } catch (error) {
    message = error instanceof Error ? error.message : "Enrollment failed";
    tone = "danger";
  } finally {
    enrollBusy = false;
    render("enroll");
  }
}

async function submitLog(logType: "IN" | "OUT") {
  if (!api) return;
  message = "Requesting a server challenge";
  tone = "";
  render("attendance");
  try {
    if (offline()) throw new Error("You appear offline. Attendance was not recorded.");
    const challenge = text(await payload(await api.requestCheckinChallenge()), "challenge");
    const location = await captureLocation();
    const image = await captureFace(livenessPrompt(challenge));
    const body = attendanceRequest({ logType, ...location, challenge, image });
    const saved = await payload(await api.submitAttendance(body));
    message = `Recorded ${text(saved, "name")}`;
    tone = "success";
    await refresh();
  } catch (error) {
    message = cameraPermissionDeniedMessage(error) || (error instanceof Error ? error.message : "Attendance was not recorded");
    tone = "danger";
    render("attendance");
  }
}

async function submitLeave(event: Event) {
  event.preventDefault();
  if (!api) return;
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
    message = `Leave ${text(saved, "name")} sent to ERP`;
    tone = "success";
    await refresh();
  } catch (error) {
    message = error instanceof Error ? error.message : "Leave was not submitted";
    tone = "danger";
    render("leave");
  }
}

async function submitCorrection(event: Event) {
  event.preventDefault();
  if (!api) return;
  const data = new FormData(event.currentTarget as HTMLFormElement);
  try {
    const body = attendanceCorrectionRequest({
      fromDate: String(data.get("fromDate") || ""),
      toDate: String(data.get("toDate") || ""),
      reason: String(data.get("reason") || ""),
      explanation: String(data.get("explanation") || ""),
    });
    const saved = await payload(await api.createAttendanceRequest(body));
    message = `Request ${text(saved, "name")} sent to ERP`;
    tone = "success";
    await refresh();
  } catch (error) {
    message = error instanceof Error ? error.message : "Request was not submitted";
    tone = "danger";
    render("profile");
  }
}

async function start() {
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
