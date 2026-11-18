export type AttendanceDirection = "IN" | "OUT";

export interface AttendanceEvidence {
  logType: AttendanceDirection;
  latitude: number;
  longitude: number;
  challenge: string;
  image: string;
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
  return {
    log_type: evidence.logType,
    latitude: evidence.latitude,
    longitude: evidence.longitude,
    challenge: evidence.challenge.trim(),
    image: evidence.image,
  };
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
