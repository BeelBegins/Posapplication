/**
 * Offline Supervisor PIN (Electron till). Online, a supervisor approves an item void or Clear Cart
 * with their ERP password through a single-use server token. Offline that is impossible, so the till
 * checks the supervisor's Offline POS PIN against a scrypt hash synced from ERP
 * (aimatic.offline_pos.supervisor_pin.get_offline_supervisor_pins). Pure: no Electron/SQLite.
 *
 * Limits that keep a short PIN tolerable: only void_item / clear_cart, only while the till is
 * offline (the renderer decides), only while the synced list is unexpired and for the same POS
 * Profile, and a terminal-wide lockout after repeated wrong tries.
 */
export const OFFLINE_SUPERVISOR_PIN_ACTIONS = ["void_item", "clear_cart"] as const;
export type OfflineSupervisorPinAction = typeof OFFLINE_SUPERVISOR_PIN_ACTIONS[number];
export const OFFLINE_PIN_MAX_FAILURES = 5;
export const OFFLINE_PIN_LOCK_MS = 5 * 60_000;

export interface OfflineSupervisor { user: string; fullName: string; pinHash: string; }
export interface OfflineSupervisorPinCache { posProfile: string; validUntil: string; syncedAt: string; supervisors: OfflineSupervisor[]; }
export interface OfflinePinLock { failed: number; lockUntil: number; }
export interface OfflinePinResult { ok: boolean; user: string; fullName: string; error: string | null; lock: OfflinePinLock; }

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Server reply (`message` of the RPC) to cache; null when it is not for this profile or malformed. */
export function parseSupervisorPinResponse(message: unknown, posProfile: string, now: Date = new Date()): OfflineSupervisorPinCache | null {
  if (!message || typeof message !== "object") return null;
  const m = message as Record<string, unknown>;
  if (text(m.pos_profile) !== posProfile || Number.isNaN(Date.parse(text(m.valid_until)))) return null;
  const rows = Array.isArray(m.supervisors) ? m.supervisors : [];
  const supervisors = rows
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}))
    .map((r) => ({ user: text(r.user), fullName: text(r.full_name) || text(r.user), pinHash: text(r.pin_hash) }))
    .filter((r) => r.user && r.pinHash.startsWith("scrypt:v1:"));
  return { posProfile, validUntil: text(m.valid_until), syncedAt: now.toISOString(), supervisors };
}

export function parseSupervisorPinCache(raw: string | null | undefined): OfflineSupervisorPinCache | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as OfflineSupervisorPinCache;
    return v && typeof v.posProfile === "string" && Array.isArray(v.supervisors) ? v : null;
  } catch { return null; }
}

export function parseLock(raw: string | null | undefined): OfflinePinLock {
  try { const v = JSON.parse(raw || "{}") as Partial<OfflinePinLock>; return { failed: Number(v.failed) || 0, lockUntil: Number(v.lockUntil) || 0 }; }
  catch { return { failed: 0, lockUntil: 0 }; }
}

export function checkOfflineSupervisorPin(input: {
  cache: OfflineSupervisorPinCache | null; posProfile: string; username: string; pin: string; action: string;
  lock: OfflinePinLock; now?: Date; verify: (pin: string, hash: string) => boolean;
}): OfflinePinResult {
  const now = (input.now ?? new Date()).getTime();
  const lock = { ...input.lock };
  const fail = (error: string, counts = false): OfflinePinResult => {
    if (counts) {
      lock.failed += 1;
      if (lock.failed >= OFFLINE_PIN_MAX_FAILURES) { lock.failed = 0; lock.lockUntil = now + OFFLINE_PIN_LOCK_MS; }
    }
    return { ok: false, user: "", fullName: "", error, lock };
  };
  if (!(OFFLINE_SUPERVISOR_PIN_ACTIONS as readonly string[]).includes(input.action)) return fail("Offline supervisor PIN only approves item void and Clear Cart.");
  if (lock.lockUntil > now) return fail(`Too many wrong PINs. Try again in ${Math.ceil((lock.lockUntil - now) / 60_000)} minute(s).`);
  const cache = input.cache;
  if (!cache || cache.posProfile !== input.posProfile || !cache.supervisors.length) return fail("No offline supervisor PINs on this till yet. Connect to ERP once so they can sync.");
  if (Date.parse(cache.validUntil) <= now) return fail("Offline supervisor PINs on this till have expired. Connect to ERP to refresh them.");
  const username = input.username.trim().toLowerCase();
  const supervisor = cache.supervisors.find((s) => s.user.toLowerCase() === username);
  // A wrong username counts as a failure too, so names cannot be probed for free.
  if (!supervisor || !/^\d{4,12}$/.test(input.pin) || !input.verify(input.pin, supervisor.pinHash)) return fail("Supervisor username or Offline PIN is wrong.", true);
  return { ok: true, user: supervisor.user, fullName: supervisor.fullName, error: null, lock: { failed: 0, lockUntil: 0 } };
}
