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

export function livenessPrompt(challenge: string): string {
  const prompts = ["Blink twice, then look at the camera", "Turn your head left, then back to centre", "Turn your head right, then back to centre", "Look up, then back at the camera"];
  return prompts[(challenge.charCodeAt(0) || 0) % prompts.length];
}
