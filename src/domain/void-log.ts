/**
 * Void log: every cart line removed, cart cleared, or held sale deleted before a sale completes.
 * ERP only ever sees finished sales, so without this a cashier could scan items, remove them and
 * keep the money with no trace. Pure (no Electron/SQLite) so it is unit-tested directly.
 */
export type VoidKind = "line_void" | "clear_cart" | "held_sale_deleted";

export interface VoidLine { itemCode: string; itemName: string; uom: string; qty: number; rate: number; amount: number; }

export interface VoidEvent {
  /** Stable idempotency key: the server must ignore a repeated eventId. */
  eventId: string;
  kind: VoidKind;
  createdAt: string;
  cashierUser: string;
  cashierName: string;
  posProfile: string;
  terminalId: string;
  hardwareId: string;
  openingEntry: string;
  customer: string;
  /** "supervisor_prompt": a supervisor password was entered for this void. "cashier_privilege": cashier's own role allows voids, nobody else approved it. "offline_supervisor_pin": the till was offline and a supervisor entered their Offline POS PIN. */
  authorizedBy: "supervisor_prompt" | "cashier_privilege" | "offline_supervisor_pin";
  /** Supervisor user who approved it (blank for cashier_privilege). */
  approvedBy?: string;
  lines: VoidLine[];
  /** Sum of qty x rate before tax (an estimate: the cart was never billed). */
  totalAmount: number;
  note: string;
  /** Cashier's reason; only asked when POS Profile.custom_require_void_reason is on, else "". */
  reason: string;
  syncedAt: string | null;
  attempts: number;
}

export interface VoidEventInput {
  kind: VoidKind;
  cashierUser: string; cashierName?: string; posProfile?: string; terminalId?: string; hardwareId?: string;
  openingEntry?: string; customer?: string; authorizedBy: VoidEvent["authorizedBy"]; approvedBy?: string; note?: string; reason?: string;
  lines: Array<{ itemCode?: unknown; itemName?: unknown; uom?: unknown; qty?: unknown; rate?: unknown }>;
}

export const VOID_LOG_MAX_EVENTS = 5000;
/** Same cap the server stores (POS Void Log.reason). */
export const VOID_REASON_MAX_LENGTH = 500;
const SYNCED_KEEP_DAYS = 90;
const money = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function buildVoidEvent(input: VoidEventInput, now: Date = new Date(), randomId: () => string = () => Math.random().toString(36).slice(2, 10)): VoidEvent {
  const lines: VoidLine[] = input.lines.map((l) => {
    const qty = num(l.qty), rate = num(l.rate);
    return { itemCode: String(l.itemCode ?? ""), itemName: String(l.itemName ?? ""), uom: String(l.uom ?? ""), qty, rate: money(rate), amount: money(qty * rate) };
  });
  return {
    eventId: `VOID-${now.getTime().toString(36)}-${randomId()}`,
    kind: input.kind, createdAt: now.toISOString(),
    cashierUser: input.cashierUser, cashierName: input.cashierName ?? input.cashierUser,
    posProfile: input.posProfile ?? "", terminalId: input.terminalId ?? "", hardwareId: input.hardwareId ?? "",
    openingEntry: input.openingEntry ?? "", customer: input.customer ?? "", authorizedBy: input.authorizedBy,
    approvedBy: String(input.approvedBy ?? "").trim().slice(0, 140),
    lines, totalAmount: money(lines.reduce((sum, l) => sum + l.amount, 0)), note: input.note ?? "",
    reason: String(input.reason ?? "").trim().slice(0, VOID_REASON_MAX_LENGTH),
    syncedAt: null, attempts: 0
  };
}

export function parseVoidLog(raw: string | null): VoidEvent[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((e) => e && typeof e.eventId === "string") : []; } catch { return []; }
}

/** Append, then bound the log: drop old synced events first, then (only if still over the cap) the oldest synced, never unsynced ones. */
export function appendVoidEvent(log: VoidEvent[], event: VoidEvent, now: Date = new Date()): VoidEvent[] {
  const cutoff = now.getTime() - SYNCED_KEEP_DAYS * 86_400_000;
  let next = [...log.filter((e) => e.eventId !== event.eventId && !(e.syncedAt && Date.parse(e.syncedAt) < cutoff)), event];
  if (next.length > VOID_LOG_MAX_EVENTS) {
    let excess = next.length - VOID_LOG_MAX_EVENTS;
    next = next.filter((e) => { if (excess > 0 && e.syncedAt) { excess -= 1; return false; } return true; });
  }
  return next;
}

export const pendingVoidEvents = (log: VoidEvent[]) => log.filter((e) => !e.syncedAt);

export function markVoidEventsSynced(log: VoidEvent[], accepted: string[], at: string): VoidEvent[] {
  const ids = new Set(accepted);
  return log.map((e) => (ids.has(e.eventId) ? { ...e, syncedAt: at } : e));
}

export function markVoidAttempts(log: VoidEvent[], tried: string[]): VoidEvent[] {
  const ids = new Set(tried);
  return log.map((e) => (ids.has(e.eventId) ? { ...e, attempts: e.attempts + 1 } : e));
}

export interface VoidFilter { openingEntry?: string; dateFrom?: string; dateTo?: string; cashierUser?: string; }

export function filterVoidEvents(log: VoidEvent[], f: VoidFilter): VoidEvent[] {
  return log.filter((e) =>
    (!f.openingEntry || e.openingEntry === f.openingEntry) &&
    (!f.cashierUser || e.cashierUser.toLowerCase() === f.cashierUser.toLowerCase()) &&
    (!f.dateFrom || e.createdAt >= f.dateFrom) && (!f.dateTo || e.createdAt <= f.dateTo)
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function summarizeVoids(events: VoidEvent[]): { count: number; amount: number; byKind: Record<VoidKind, { count: number; amount: number }> } {
  const byKind: Record<VoidKind, { count: number; amount: number }> = { line_void: { count: 0, amount: 0 }, clear_cart: { count: 0, amount: 0 }, held_sale_deleted: { count: 0, amount: 0 } };
  for (const e of events) { byKind[e.kind].count += 1; byKind[e.kind].amount = money(byKind[e.kind].amount + e.totalAmount); }
  return { count: events.length, amount: money(events.reduce((s, e) => s + e.totalAmount, 0)), byKind };
}
