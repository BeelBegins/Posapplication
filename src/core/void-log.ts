import { authFetch } from "./auth-fetch";
import type { PosCoreDeps } from "./types";
import { appendVoidEvent, buildVoidEvent, filterVoidEvents, markVoidAttempts, markVoidEventsSynced, parseVoidLog, pendingVoidEvents, summarizeVoids, type VoidEvent, type VoidEventInput, type VoidFilter } from "../domain/void-log";

export const VOID_LOG_META_KEY = "void_log_v1";
/** Whitelisted aimatic method that stores the events. Idempotent by eventId; must answer { accepted: [eventId, ...] }. */
export const VOID_LOG_ENDPOINT = "aimatic.offline_pos.api.log_pos_voids";
const BATCH = 50;

export function createVoidLogCore(deps: PosCoreDeps, identity: () => { terminalId: string; hardwareId: string; openingEntry: string }) {
  const read = (): VoidEvent[] => parseVoidLog(deps.db.getMeta(VOID_LOG_META_KEY));
  const write = (log: VoidEvent[]) => deps.db.setMeta(VOID_LOG_META_KEY, JSON.stringify(log));

  /** Local first, always: a void is recorded even offline or while the server has no endpoint yet. Never throws into the cart. */
  function recordVoid(input: VoidEventInput): { ok: boolean; eventId: string; error: string | null } {
    try {
      const id = identity();
      const settings = deps.db.loadSettings();
      const event = buildVoidEvent({
        ...input,
        terminalId: input.terminalId || id.terminalId,
        hardwareId: input.hardwareId || id.hardwareId,
        openingEntry: input.openingEntry || id.openingEntry,
        posProfile: input.posProfile || settings.posProfile
      });
      write(appendVoidEvent(read(), event));
      return { ok: true, eventId: event.eventId, error: null };
    } catch (error) {
      return { ok: false, eventId: "", error: error instanceof Error ? error.message : "Unable to record void." };
    }
  }

  function listVoids(filter: VoidFilter = {}) {
    const events = filterVoidEvents(read(), filter);
    return { events, summary: summarizeVoids(events), pending: pendingVoidEvents(read()).length };
  }

  async function syncVoids(): Promise<{ sent: number; remaining: number; error: string | null }> {
    const settings = deps.db.loadSettings();
    const pending = pendingVoidEvents(read());
    if (!pending.length) return { sent: 0, remaining: 0, error: null };
    if (!settings.erpnextUrl) return { sent: 0, remaining: pending.length, error: "ERP URL is not set." };
    const base = new URL(settings.erpnextUrl).toString().replace(/\/+$/, "");
    let sent = 0;
    try {
      for (let i = 0; i < pending.length; i += BATCH) {
        const batch = pending.slice(i, i + BATCH);
        const response = await authFetch(deps, `${base}/api/method/${VOID_LOG_ENDPOINT}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pos_profile: settings.posProfile, events: JSON.stringify(batch.map(({ syncedAt, attempts, ...rest }) => { void syncedAt; void attempts; return rest; })) })
        });
        if (!response.ok) {
          write(markVoidAttempts(read(), batch.map((e) => e.eventId)));
          // 404 / missing method = the server has not been updated yet: keep everything queued, say so plainly.
          return { sent, remaining: pendingVoidEvents(read()).length, error: response.status === 404 ? "ERP does not have the void log endpoint yet; voids stay saved on this till." : `ERP rejected the void log (HTTP ${response.status}).` };
        }
        const body = await response.json().catch(() => ({})) as { message?: { accepted?: unknown } };
        const accepted = Array.isArray(body.message?.accepted) ? body.message.accepted.map(String) : [];
        write(markVoidEventsSynced(read(), accepted, new Date().toISOString()));
        sent += accepted.length;
        if (accepted.length < batch.length) { write(markVoidAttempts(read(), batch.filter((e) => !accepted.includes(e.eventId)).map((e) => e.eventId))); return { sent, remaining: pendingVoidEvents(read()).length, error: "ERP did not accept every void; will retry." }; }
      }
      return { sent, remaining: pendingVoidEvents(read()).length, error: null };
    } catch (error) {
      return { sent, remaining: pendingVoidEvents(read()).length, error: error instanceof Error ? error.message : "Offline." };
    }
  }

  return { recordVoid, listVoids, syncVoids };
}
