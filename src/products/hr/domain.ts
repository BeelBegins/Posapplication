export type AttendanceDirection = "IN" | "OUT";

export interface AttendanceEvidence {
  logType: AttendanceDirection;
  latitude: number;
  longitude: number;
  challenge: string;
  image: string;
  /** GPS horizontal accuracy in metres, when the device reports one. */
  accuracy?: number | null;
}

const authorityKeys = new Set(["employee", "time", "log_time", "timestamp", "verified", "match", "liveness", "match_score"]);

export function rejectClientAuthority(extras: Record<string, unknown> = {}): void {
  const supplied = Object.keys(extras).filter((key) => authorityKeys.has(key.toLowerCase()));
  if (supplied.length) {
    throw new Error("Employee, time, and face verification are decided by the server.");
  }
}

export function attendanceRequest(evidence: AttendanceEvidence, extras: Record<string, unknown> = {}): Record<string, string | number> {
  rejectClientAuthority(extras);
  if (evidence.logType !== "IN" && evidence.logType !== "OUT") {
    throw new Error("Attendance direction must be check-in or check-out.");
  }
  if (!Number.isFinite(evidence.latitude) || !Number.isFinite(evidence.longitude) || (evidence.latitude === 0 && evidence.longitude === 0)) {
    throw new Error("A real device location is required.");
  }
  if (evidence.challenge.trim().length < 32) throw new Error("Attendance challenge is missing or expired.");
  if (!/^data:image\/(?:jpeg|png);base64,/i.test(evidence.image)) throw new Error("A live camera capture is required.");
  const body: Record<string, string | number> = {
    log_type: evidence.logType,
    latitude: evidence.latitude,
    longitude: evidence.longitude,
    challenge: evidence.challenge.trim(),
    image: evidence.image,
  };
  // The server applies its GPS accuracy limit and widens nothing on the client's say-so; a
  // missing or nonsensical reading is simply not sent.
  if (typeof evidence.accuracy === "number" && Number.isFinite(evidence.accuracy) && evidence.accuracy > 0) {
    body.accuracy = Math.round(evidence.accuracy * 10) / 10;
  }
  return body;
}

export function leaveRequest(input: { leaveType: string; fromDate: string; toDate: string; description?: string; halfDay?: boolean }, extras: Record<string, unknown> = {}) {
  rejectClientAuthority(extras);
  if (!input.leaveType.trim() || !input.fromDate || !input.toDate) throw new Error("Leave type and dates are required.");
  if (input.toDate < input.fromDate) throw new Error("Leave end date cannot be before the start date.");
  return {
    leave_type: input.leaveType.trim(),
    from_date: input.fromDate,
    to_date: input.toDate,
    description: input.description?.trim() || "",
    half_day: input.halfDay ? 1 : 0,
  };
}

export function attendanceCorrectionRequest(input: { fromDate: string; toDate: string; reason: string; explanation?: string }, extras: Record<string, unknown> = {}) {
  rejectClientAuthority(extras);
  if (!input.fromDate || !input.toDate || !input.reason.trim()) throw new Error("Dates and a reason are required.");
  if (input.toDate < input.fromDate) throw new Error("Request end date cannot be before the start date.");
  return {
    from_date: input.fromDate,
    to_date: input.toDate,
    reason: input.reason,
    explanation: input.explanation?.trim() || "",
  };
}

/** Starts `ms`'s timer before invoking `task`, so a slow-to-call async operation (e.g. one gated behind a browser permission prompt) is still bounded from the moment the caller commits to it. */
export function raceWithTimeout<T>(task: () => Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    task().then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export function livenessPrompt(challenge: string): string {
  const prompts = ["Blink twice, then look at the camera", "Turn your head left, then back to centre", "Turn your head right, then back to centre", "Look up, then back at the camera"];
  return prompts[(challenge.charCodeAt(0) || 0) % prompts.length];
}

export const FACE_CONSENT_VERSION = "aimatichr-face-consent-v1";

export const ENROLL_CAPTURE_PROMPTS = [
  "Look straight at the camera — center your face in the oval",
  "Turn slightly left, then return to centre",
  "Turn slightly right, then return to centre",
  "Look up a little, then return to centre",
  "Blink once, then hold still",
] as const;

export function canManageFaceEnrollment(roles: unknown): boolean {
  const set = new Set(Array.isArray(roles) ? roles.map(String) : []);
  return set.has("HR Manager") || set.has("System Manager");
}

export function enrollmentPromptForIndex(index: number): string {
  return ENROLL_CAPTURE_PROMPTS[Math.max(0, Math.min(index, ENROLL_CAPTURE_PROMPTS.length - 1))];
}

export function canSubmitEnrollment(input: { employee: string; images: string[]; consent: boolean; busy?: boolean }): boolean {
  return Boolean(input.employee.trim()) && input.images.length >= 3 && input.images.length <= 5 && input.consent && !input.busy;
}

export function cameraPermissionDeniedMessage(error: unknown): string | null {
  const text = error instanceof Error ? error.message : String(error || "");
  if (/NotAllowedError|Permission denied|permission-denied|denied by user/i.test(text)) {
    return "Camera permission is off. Open Android Settings → Apps → Ai Matic HR → Permissions → Camera, enable it, then tap Retry camera.";
  }
  if (/NotFoundError|DevicesNotFound|Requested device not found/i.test(text)) {
    return "No front camera was found on this device.";
  }
  if (/NotReadableError|TrackStartError|Could not start video source/i.test(text)) {
    return "The camera is busy in another app. Close it and tap Retry camera.";
  }
  return null;
}

export function enrollFaceRequest(input: {
  employee: string;
  images: string[];
  consent: boolean;
  consentVersion?: string;
}): Record<string, unknown> {
  const employee = input.employee.trim();
  if (!employee) throw new Error("Choose an employee to enroll.");
  if (input.images.length < 3 || input.images.length > 5) {
    throw new Error("Capture 3 to 5 live face photos.");
  }
  for (const image of input.images) {
    if (!/^data:image\/(?:jpeg|png);base64,/i.test(image)) {
      throw new Error("Each enrollment photo must be a live camera capture.");
    }
  }
  if (!input.consent) throw new Error("Recorded employee consent is required.");
  const consentVersion = (input.consentVersion || FACE_CONSENT_VERSION).trim();
  if (consentVersion !== FACE_CONSENT_VERSION) {
    throw new Error(`Consent policy version must be ${FACE_CONSENT_VERSION}.`);
  }
  return {
    employee,
    images: input.images,
    consent: 1,
    consent_version: FACE_CONSENT_VERSION,
  };
}

export interface CalendarDay {
  date: string;
  status: string;
  in_time?: string | null;
  out_time?: string | null;
  working_hours?: number | null;
  late_entry?: boolean;
  early_exit?: boolean;
  leave_type?: string | null;
}

export type CalendarCell = { day: CalendarDay | null; dayOfMonth: number | null };

/** "YYYY-MM" for the month `delta` months away from `month` ("YYYY-MM"). */
export function shiftMonth(month: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("Month must be YYYY-MM.");
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String(index - year * 12 + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(match[2]) - 1] || ""} ${match[1]}`;
}

/** Monday-first weeks of cells for a month grid; leading/trailing cells are empty. */
export function calendarWeeks(month: string, days: CalendarDay[]): CalendarCell[][] {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return [];
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const byDate = new Map(days.map((day) => [day.date, day]));
  const cells: CalendarCell[] = Array.from({ length: firstWeekday }, () => ({ day: null, dayOfMonth: null }));
  for (let dom = 1; dom <= count; dom += 1) {
    const key = `${match[1]}-${match[2]}-${String(dom).padStart(2, "0")}`;
    cells.push({ day: byDate.get(key) || null, dayOfMonth: dom });
  }
  while (cells.length % 7) cells.push({ day: null, dayOfMonth: null });
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type DayTone = "present" | "absent" | "half" | "leave" | "holiday" | "off" | "none" | "upcoming";

export function dayTone(status: string): DayTone {
  switch (status) {
    case "Present": case "Work From Home": return "present";
    case "Absent": return "absent";
    case "Half Day": return "half";
    case "On Leave": return "leave";
    case "Holiday": return "holiday";
    case "Weekly Off": return "off";
    case "Upcoming": return "upcoming";
    default: return "none";
  }
}

/** Plain-language line describing where the employee may check in. */
export function checkinAreaText(info: { enforced?: unknown; required?: unknown; location?: unknown }): string {
  // No policy loaded (still loading, older server, or the lookup failed): don't claim one.
  if (!info || !("enforced" in info)) return "The server checks your check-in location when you punch.";
  const location = info.location && typeof info.location === "object" ? info.location as Record<string, unknown> : null;
  if (!info.enforced) return "Location is recorded with each check-in.";
  if (!location) return info.required ? "No check-in location is assigned to you. Ask HR to assign one before checking in." : "No check-in area is set for your shift, so any location is accepted.";
  const name = String(location.location_name || location.name || "your site");
  const radius = Number(location.radius_m);
  return Number.isFinite(radius) && radius > 0 ? `Check in within ${Math.round(radius)} m of ${name}.` : `Check in at ${name}.`;
}

/** Local (device timezone) calendar date as YYYY-MM-DD; toISOString() would give the UTC date. */
export function localIsoDate(value: Date = new Date()): string {
  return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseParts(value: unknown): { y: number; m: number; d: number; time: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(typeof value === "string" ? value.trim() : "");
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || m > 12 || probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  if (match[4] && (Number(match[4]) > 23 || Number(match[5]) > 59)) return null;
  return { y, m, d, time: match[4] ? `${match[4]}:${match[5]}` : "" };
}

/** "Tue 17 Nov" from an ERP date or datetime string (server wall-clock, no timezone shift). */
export function formatDay(value: unknown): string {
  const p = parseParts(value);
  if (!p) return typeof value === "string" ? value : "";
  const weekday = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
  return `${weekday} ${p.d} ${MONTHS_SHORT[p.m - 1]}`;
}

/** "Tue 17 Nov · 09:02" from an ERP datetime string. */
export function formatDateTime(value: unknown): string {
  const p = parseParts(value);
  if (!p) return typeof value === "string" ? value : "";
  return p.time ? `${formatDay(value)} · ${p.time}` : formatDay(value);
}

/** "09:02" from an ERP datetime string, or "". */
export function formatTime(value: unknown): string {
  return parseParts(value)?.time || "";
}

/** "20 Nov" or "20–22 Nov" or "30 Nov – 2 Dec" for an inclusive ERP date range. */
export function formatDateRange(from: unknown, to: unknown): string {
  const a = parseParts(from), b = parseParts(to);
  if (!a) return "";
  const left = `${a.d} ${MONTHS_SHORT[a.m - 1]}`;
  if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) return left;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS_SHORT[a.m - 1]}`;
  if (a.y !== b.y) return `${left} ${a.y} – ${b.d} ${MONTHS_SHORT[b.m - 1]} ${b.y}`;
  return `${left} – ${b.d} ${MONTHS_SHORT[b.m - 1]}`;
}

/** "November 2026" for a salary slip start date. */
export function formatMonthOf(value: unknown): string {
  const p = parseParts(value);
  return p ? monthLabel(`${p.y}-${String(p.m).padStart(2, "0")}`) : "";
}

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/** Tone for an ERP document status chip (leave, requests, payslips). */
export function statusTone(status: string): StatusTone {
  const value = status.trim().toLowerCase();
  if (["approved", "submitted", "paid", "present", "completed"].includes(value)) return "success";
  if (["rejected", "cancelled", "absent"].includes(value)) return "danger";
  if (["open", "pending", "draft", "half day"].includes(value)) return "warning";
  return "info";
}
