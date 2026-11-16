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
  canManageFaceEnrollment,
  enrollFaceRequest,
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

const text = (row: Row | undefined, ...keys: string[]) => {
  for (const key of keys) if (row?.[key] != null && row[key] !== "") return String(row[key]);
  return "";
};
const list = (value: unknown): Row[] => Array.isArray(value) ? value.filter((entry): entry is Row => Boolean(entry) && typeof entry === "object") : [];
const money = (value: unknown) => formatMoney(value, "PKR");
const isManager = () => canManageFaceEnrollment(context.roles);

async function payload(response: Response): Promise<Row> {
  const raw = await response.json().catch(() => ({})) as Row;
  const value = (raw.message && typeof raw.message === "object" ? raw.message : raw) as Row;
  if (!response.ok) throw new Error(normalizeErpDisplayText(text(value, "message", "exception") || `Server error ${response.status}`));
  return value;
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
  root.innerHTML = `<section class="setup"><div class="setup-card"><div class="mark">HR</div><p class="eyebrow">Employee app</p><h1>Ai Matic HR</h1><p>Sign in with your ERP employee account. Attendance, leave and pay stay on the server.</p>${error ? `<p class="alert danger">${esc(error)}</p>` : ""}<form id="setup"><label>ERP URL<input id="url" type="url" required placeholder="https://erp.example.com" autocomplete="url"></label><button class="primary">Continue</button></form><small>v${esc(__APP_VERSION__)} · No API key or secret</small></div></section>`;
  document.querySelector<HTMLFormElement>("#setup")!.onsubmit = async (event) => {
    event.preventDefault();
    try { await configure(document.querySelector<HTMLInputElement>("#url")!.value); signIn(); }
    catch (reason) { setup(reason instanceof Error ? reason.message : "Connection failed"); }
  };
}

function signIn() {
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
  return `<section class="stack"><article class="tile"><p class="eyebrow">Live attendance</p><h2>Check in or out</h2><p>The server records the time, employee and face result. This phone only sends location, a one-time challenge and a camera frame.</p>${previewUrl ? `<img class="camera" alt="Live face preview" src="${esc(previewUrl)}">` : ""}<p id="liveness"></p><div class="actions"><button class="primary" data-log="IN">Check in</button><button class="secondary" data-log="OUT">Check out</button></div></article>${rows(checkins, (row) => `${text(row, "log_type") || "Log"} · ${text(row, "time")}`, (row) => text(row, "shift") || "Recorded by ERP")}</section>`;
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
    return `<button type="button" class="row pick${active}" data-employee="${esc(id)}"><strong>${esc(text(row, "employee_name") || id)}</strong><small>${esc([id, text(row, "designation"), text(row, "department")].filter(Boolean).join(" · "))}</small></button>`;
  }).join("");
  const thumbs = enrollCaptures.map((image, index) => `<img class="camera thumb" alt="Capture ${index + 1}" src="${esc(image)}">`).join("");
  const policyVersion = text(facePolicy, "consent_version") || FACE_CONSENT_VERSION;
  return `<section class="stack"><article class="tile"><p class="eyebrow">HR enrollment</p><h2>Enroll face template</h2><p>Capture 3 to 5 live photos. Raw images are not stored after the server builds the encrypted template. Completing enrollment also finishes an existing Pending record for the same employee.</p>
    <form id="enroll-search" class="stack"><label>Find employee<input id="enroll-query" value="${esc(enrollQuery)}" placeholder="Name or department" autocomplete="off"></label><button class="secondary">Search directory</button></form>
    <div class="stack picks">${picks || emptyState(icon("search", 28), "No employees", "Search the directory to pick who to enroll.")}</div>
    ${selected ? `<p class="eyebrow">Selected</p><strong>${esc(text(selected, "employee_name"))}</strong><small> ${esc(text(selected, "name"))}</small>` : ""}
    <div class="actions"><button class="secondary" id="capture-enroll" ${enrollCaptures.length >= 5 ? "disabled" : ""}>Capture photo (${enrollCaptures.length}/5)</button><button class="secondary" id="clear-enroll" ${enrollCaptures.length ? "" : "disabled"}>Clear photos</button></div>
    <div class="grid thumbs">${thumbs}</div>
    <label class="consent"><input id="enroll-consent" type="checkbox" ${enrollConsent ? "checked" : ""}> Employee consent recorded for policy <code>${esc(policyVersion)}</code>. Attendance face check uses an encrypted template only; photos are not kept; HR can revoke and wipe later.</label>
    <button class="primary" id="submit-enroll">Submit enrollment</button>
  </article></section>`;
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
  root.innerHTML = `<section class="shell"><header class="top"><div><strong>Ai Matic HR</strong><small>${esc(text(context, "employee_name") || "Not signed in")}</small></div></header><main class="page">${message ? `<p class="alert ${esc(tone)}">${esc(message)}</p>` : ""}${pages[screen]()}</main>${bottomNavigation("HR", screen, nav)}</section>`;
  bind();
}

function bind() {
  document.querySelectorAll<HTMLButtonElement>("[data-screen]").forEach((button) => {
    button.onclick = () => { message = ""; render(button.dataset.screen as Screen); };
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
      message = "";
      tone = "";
      render("enroll");
    };
  });
  document.querySelector<HTMLInputElement>("#enroll-consent")?.addEventListener("change", (event) => {
    enrollConsent = (event.currentTarget as HTMLInputElement).checked;
  });
  document.querySelector<HTMLButtonElement>("#capture-enroll")?.addEventListener("click", () => void captureEnrollmentPhoto());
  document.querySelector<HTMLButtonElement>("#clear-enroll")?.addEventListener("click", () => {
    enrollCaptures = [];
    previewUrl = "";
    render("enroll");
  });
  document.querySelector<HTMLButtonElement>("#submit-enroll")?.addEventListener("click", () => void submitEnrollment());
  document.querySelector<HTMLButtonElement>("#sign-out")?.addEventListener("click", () => {
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
  if (!api || !isManager()) return;
  enrollQuery = document.querySelector<HTMLInputElement>("#enroll-query")?.value.trim() || "";
  try {
    directory = list(await payload(await api.getDirectory(enrollQuery)));
    message = directory.length ? `Found ${directory.length} employee${directory.length === 1 ? "" : "s"}` : "No employees matched";
    tone = directory.length ? "success" : "danger";
    render("enroll");
  } catch (error) {
    message = error instanceof Error ? error.message : "Directory search failed";
    tone = "danger";
    render("enroll");
  }
}

async function captureLocation() {
  let permission = await Geolocation.checkPermissions();
  if (permission.location !== "granted") permission = await Geolocation.requestPermissions({ permissions: ["location"] });
  if (permission.location !== "granted") throw new Error("Precise location permission is required.");
  const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

async function captureFace(prompt: string): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    const note = document.querySelector("#liveness");
    if (note) note.textContent = prompt;
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 640;
    const context2d = canvas.getContext("2d");
    if (!context2d) throw new Error("Camera capture failed.");
    context2d.drawImage(video, 0, 0, canvas.width, canvas.height);
    previewUrl = canvas.toDataURL("image/jpeg", 0.82);
    return previewUrl;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

async function captureEnrollmentPhoto() {
  if (enrollCaptures.length >= 5) return;
  try {
    const prompts = [
      "Look straight at the camera",
      "Turn slightly left, then centre",
      "Turn slightly right, then centre",
      "Look up a little, then centre",
      "Blink once, then hold still",
    ];
    const image = await captureFace(prompts[enrollCaptures.length] || prompts[0]);
    enrollCaptures = [...enrollCaptures, image];
    message = `Captured photo ${enrollCaptures.length} of 5`;
    tone = "success";
    render("enroll");
  } catch (error) {
    message = error instanceof Error ? error.message : "Camera capture failed";
    tone = "danger";
    render("enroll");
  }
}

async function submitEnrollment() {
  if (!api || !isManager()) return;
  enrollConsent = Boolean(document.querySelector<HTMLInputElement>("#enroll-consent")?.checked);
  try {
    const body = enrollFaceRequest({
      employee: enrollEmployee,
      images: enrollCaptures,
      consent: enrollConsent,
      consentVersion: text(facePolicy, "consent_version") || FACE_CONSENT_VERSION,
    });
    message = "Submitting enrollment to ERP";
    tone = "";
    render("enroll");
    const saved = await payload(await api.enrollFace(body));
    enrollCaptures = [];
    enrollConsent = false;
    previewUrl = "";
    message = `Enrolled ${text(saved, "name") || enrollEmployee} · ${text(saved, "status") || "Enrolled"}`;
    tone = "success";
    context = await payload(await api.getContext());
    render("enroll");
  } catch (error) {
    message = error instanceof Error ? error.message : "Enrollment failed";
    tone = "danger";
    render("enroll");
  }
}

async function submitLog(logType: "IN" | "OUT") {
  if (!api) return;
  message = "Requesting a server challenge";
  tone = "";
  render("attendance");
  try {
    const challenge = text(await payload(await api.requestCheckinChallenge()), "challenge");
    const location = await captureLocation();
    const image = await captureFace(livenessPrompt(challenge));
    const body = attendanceRequest({ logType, ...location, challenge, image });
    const saved = await payload(await api.submitAttendance(body));
    message = `Recorded ${text(saved, "name")}`;
    tone = "success";
    await refresh();
  } catch (error) {
    message = error instanceof Error ? error.message : "Attendance was not recorded";
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
