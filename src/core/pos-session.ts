import type { PosCoreDeps, PosSessionSummary, ShiftPaymentRow, ShiftSummary } from "./types";
import { asRecord, textValue, sameIdentity, unwrapFrappePayload, getResponseError } from "./http";
import { authFetch, hasUsableCredentials } from "./auth-fetch";
import type { ShiftHistoryRow } from "../db/database";

function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

function sessionFromPayload(payload: Record<string, unknown>): Record<string, unknown> | null {
  const nested = asRecord(payload.session) ?? asRecord(payload.pos_opening_entry) ?? asRecord(payload.opening_entry_doc);
  if (nested) return nested;
  return textValue(payload, "opening_entry") || textValue(payload, "name") ? payload : null;
}

function matchingOpenEntry(entries: Record<string, unknown>[], posProfile: string, cashierUser: string): Record<string, unknown> | null {
  const matches = entries.filter((entry) => {
    const status = textValue(entry, "status") || "Open";
    const docstatus = entry.docstatus === undefined || entry.docstatus === null || entry.docstatus === "" ? 1 : Number(entry.docstatus);
    const profile = textValue(entry, "pos_profile");
    const user = textValue(entry, "user");
    return status === "Open"
      && docstatus === 1
      && (!profile || sameIdentity(profile, posProfile))
      && (!user || sameIdentity(user, cashierUser));
  });
  return matches.length === 1 ? matches[0] : null;
}

function summarizePosSession(session: Record<string, unknown> | null): PosSessionSummary {
  if (!session) {
    return { sessionStatus: "Not Open", openingEntry: "", user: "", startDateTime: "", openingBalanceRowsCount: 0, lastSynced: null };
  }
  const date = textValue(session, "period_start_date") || textValue(session, "posting_date") || textValue(session, "creation");
  const time = textValue(session, "period_start_time");
  const balances = Array.isArray(session.balance_details) ? session.balance_details : [];
  return {
    sessionStatus: textValue(session, "status") === "Open" ? "Open" : "Not Open",
    openingEntry: textValue(session, "name"),
    user: textValue(session, "user"),
    startDateTime: [date, time].filter(Boolean).join(" ") || date,
    openingBalanceRowsCount: balances.length,
    lastSynced: textValue(session, "synced_at") || null
  };
}

function paymentModeText(row: ShiftPaymentRow): string {
  return String(row.mode_of_payment ?? "");
}

function hasPaymentBreakdown(summary: ShiftSummary): boolean {
  return summary.payments.some((row) => row.sale_amount !== undefined || row.refund_amount !== undefined || row.net_movement !== undefined);
}

function numValue(record: Record<string, unknown> | null, ...keys: string[]): number {
  for (const key of keys) { const v = record?.[key]; if (typeof v === "number") return v; if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v); }
  return 0;
}

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function isOfflineBatchId(value: string): boolean {
  return value.trim().toUpperCase().startsWith("OFFLINE-");
}

function realOpeningEntry(value: string): string {
  const openingEntry = value.trim();
  return isOfflineBatchId(openingEntry) ? "" : openingEntry;
}

/**
 * POS session/shift orchestration (start shift, closing summary, close shift, local
 * shift-estimate reconciliation) plus cart/terminal identity helpers used by the
 * sale/refund group. Bound to PosCoreDeps.
 */
export function createPosSessionCore(deps: PosCoreDeps) {
  function getPaymentMethods(): string[] {
    const profile = asRecord(deps.db.getPosBootstrap(deps.db.loadSettings().posProfile)?.pos_profile);
    const rows = Array.isArray(profile?.payments) ? profile.payments : [];
    return [...new Set(rows.map(asRecord).map((row) => textValue(row, "mode_of_payment")).filter(Boolean))];
  }

  function applyLocalRefundBreakdown(summary: ShiftSummary, openingEntry: string, collectedAmountIsNet = true): ShiftSummary {
    if (hasPaymentBreakdown(summary)) return summary;
    const rawBreakdown = deps.db.getShiftRefundBreakdown(openingEntry);
    const totalRefund = Object.values(rawBreakdown).reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0);
    if (totalRefund <= 0) return summary;

    const modes = summary.payments.map(paymentModeText).filter(Boolean);
    const cashMode = modes.find((mode) => mode.toLowerCase().includes("cash")) ?? modes[0] ?? "";
    const refundByMode = new Map<string, number>();
    for (const [mode, amount] of Object.entries(rawBreakdown)) {
      const targetMode = mode && modes.includes(mode) ? mode : cashMode;
      refundByMode.set(targetMode, (refundByMode.get(targetMode) ?? 0) + Math.abs(Number(amount) || 0));
    }

    const payments = summary.payments.map((row) => {
      const mode = paymentModeText(row);
      const opening = numValue(row as unknown as Record<string, unknown>, "opening_amount");
      const collected = numValue(row as unknown as Record<string, unknown>, "collected_amount");
      const refund = -Math.abs(refundByMode.get(mode) ?? 0);
      const net = collectedAmountIsNet ? collected : collected + refund;
      const sale = collectedAmountIsNet ? net - refund : collected;
      const expected = row.expected_amount !== undefined && collectedAmountIsNet ? row.expected_amount : opening + net;
      return {
        ...row,
        opening_amount: opening,
        sale_amount: sale,
        refund_amount: refund,
        net_movement: net,
        collected_amount: net,
        expected_amount: expected
      };
    });

    return {
      ...summary,
      payments,
      netSales: payments.reduce((sum, row) => sum + (row.sale_amount ?? 0), 0),
      refunds: payments.reduce((sum, row) => sum + (row.refund_amount ?? 0), 0),
      totalOpening: payments.reduce((sum, row) => sum + row.opening_amount, 0),
      totalExpected: payments.reduce((sum, row) => sum + row.expected_amount, 0)
    };
  }

  async function syncPosSession(input: Record<string, unknown> = {}): Promise<{ success: boolean; summary: PosSessionSummary; error: string | null }> {
    const result = await getActivePosSession(input);
    return { success: result.success, summary: summarizePosSession(result.session), error: result.error };
  }

  async function getActivePosSession(input: Record<string, unknown> = {}): Promise<{ success: boolean; session: Record<string, unknown> | null; error: string | null; diagnosticReason: string; apiUser: string; requestedPosProfile: string; entries: Record<string, unknown>[] }> {
    const s = deps.db.loadSettings();
    const cashierUser = textValue(input, "cashier_user");
    if (!hasUsableCredentials(deps, s) || !s.erpnextUrl) return { success: false, session: null, error: "Online connection required to load POS session.", diagnosticReason: "Missing ERPNext URL or credentials", apiUser: "", requestedPosProfile: s.posProfile, entries: [] };
    if (!cashierUser) return { success: false, session: null, error: "Cashier user is required to load POS session.", diagnosticReason: "Cashier user missing", apiUser: "", requestedPosProfile: s.posProfile, entries: [] };
    try {
      const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
      const query = new URLSearchParams({ pos_profile: s.posProfile, cashier_user: cashierUser });
      const r = await authFetch(deps, `${base}/api/method/aimatic.offline_pos.api.get_active_pos_session?${query.toString()}`);
      if (!r.ok) {
        const error = await getResponseError(r);
        return { success: false, session: null, error, diagnosticReason: error, apiUser: "", requestedPosProfile: s.posProfile, entries: [] };
      }
      const b = await r.json() as Record<string, unknown>;
      const payload = unwrapFrappePayload(b);
      const entries = (Array.isArray(payload.submitted_open_entries) ? payload.submitted_open_entries : Array.isArray(payload.open_entries) ? payload.open_entries : []).map(asRecord).filter((x): x is Record<string, unknown> => Boolean(x));
      const session = sessionFromPayload(payload) ?? matchingOpenEntry(entries, s.posProfile, cashierUser);
      const diagnosticReason = textValue(payload, "diagnostic_reason") || textValue(payload, "reason") || (session ? "Active session returned" : "No active POS Opening Entry returned by server");
      const apiUser = textValue(payload, "authenticated_user") || textValue(payload, "api_user");
      if (session) {
        const entry = textValue(session, "opening_entry") || textValue(session, "name");
        if (entry) deps.db.cachePosSession(entry, s.posProfile, textValue(session, "user") || cashierUser, session, new Date().toISOString());
      }
      return { success: true, session, error: null, diagnosticReason, apiUser, requestedPosProfile: textValue(payload, "requested_pos_profile") || textValue(payload, "pos_profile") || s.posProfile, entries };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unable to load POS session.";
      return { success: false, session: null, error, diagnosticReason: error, apiUser: "", requestedPosProfile: s.posProfile, entries: [] };
    }
  }

  async function startPosSession(input: Record<string, unknown>): Promise<{ success: boolean; session: Record<string, unknown> | null; error: string | null }> {
    const s = deps.db.loadSettings();
    if (!hasUsableCredentials(deps, s) || !s.erpnextUrl) return { success: false, session: null, error: "Online connection required to start shift" };
    const cashierUser = textValue(input, "cashier_user");
    if (!cashierUser) return { success: false, session: null, error: "Cashier user is required to start shift" };
    try {
      const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
      const r = await authFetch(deps, `${base}/api/method/aimatic.offline_pos.api.start_pos_session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pos_profile: s.posProfile, opening_balances: JSON.stringify(Array.isArray(input.opening_balances) ? input.opening_balances : []), cashier_user: cashierUser, local_offline_session_id: textValue(input, "local_offline_session_id") }) });
      if (!r.ok) {
        const body = await r.clone().json().catch(() => null) as unknown;
        const payload = unwrapFrappePayload(body);
        const entries = (Array.isArray(payload.submitted_open_entries) ? payload.submitted_open_entries : Array.isArray(payload.open_entries) ? payload.open_entries : []).map(asRecord).filter((x): x is Record<string, unknown> => Boolean(x));
        const session = sessionFromPayload(payload) ?? matchingOpenEntry(entries, s.posProfile, cashierUser);
        const entry = textValue(session, "opening_entry") || textValue(session, "name");
        if (session && entry) {
          deps.db.cachePosSession(entry, s.posProfile, textValue(session, "user") || cashierUser, session, new Date().toISOString());
          return { success: true, session, error: null };
        }
        return { success: false, session: null, error: await getResponseError(r) };
      }
      const b = await r.json() as Record<string, unknown>;
      const payload = unwrapFrappePayload(b);
      const entries = (Array.isArray(payload.submitted_open_entries) ? payload.submitted_open_entries : Array.isArray(payload.open_entries) ? payload.open_entries : []).map(asRecord).filter((x): x is Record<string, unknown> => Boolean(x));
      const session = sessionFromPayload(payload) ?? matchingOpenEntry(entries, s.posProfile, cashierUser);
      const entry = textValue(session, "opening_entry") || textValue(session, "name");
      if (!session || !entry) return { success: false, session: null, error: "Server returned no Opening Entry." };
      deps.db.cachePosSession(entry, s.posProfile, textValue(session, "user") || cashierUser, session, new Date().toISOString());
      return { success: true, session, error: null };
    } catch (e) { return { success: false, session: null, error: e instanceof Error ? e.message : "Unable to start shift." }; }
  }

  // Build a Close Shift summary from local data only (cached Opening Entry balances + submitted sales for this shift).
  // Authoritative reconciliation happens server-side on close; these figures are the cashier's local estimate.
  function getLocalShiftSummary(openingEntry?: string): { success: boolean; summary: ShiftSummary | null; error: string | null } {
    const settings = deps.db.loadSettings();
    const session = deps.db.getCachedPosSession(settings.posProfile);
    if (!session) return { success: false, summary: null, error: "No cached POS Opening Entry — refresh the session first." };
    const entry = textValue(session, "name") || textValue(session, "opening_entry");
    if (openingEntry && entry && openingEntry !== entry) {
      return { success: false, summary: null, error: `Cached shift is ${entry}, not ${openingEntry}. Refresh the session.` };
    }
    const openingByMode = new Map<string, number>();
    const balances = Array.isArray(session.balance_details) ? session.balance_details : [];
    for (const row of balances) { const r = asRecord(row); const mode = textValue(r, "mode_of_payment"); if (mode) openingByMode.set(mode, numValue(r, "opening_amount")); }
    // Ensure every POS Profile payment method is present even with a zero opening balance.
    for (const mode of getPaymentMethods()) if (!openingByMode.has(mode)) openingByMode.set(mode, 0);

    const collectedByMode = new Map<string, number>();
    let invoiceCount = 0; let netSales = 0;
    const history = deps.db.listSalesHistory({ limit: 200 });
    for (const sale of history) {
      if (sale.status !== "Submitted") continue;
      const payload = sale.payload;
      if (!payload || textValue(payload, "opening_entry") !== entry) continue;
      invoiceCount += 1;
      const payments = Array.isArray(payload.payments) ? payload.payments : [];
      for (const p of payments) { const pr = asRecord(p); const mode = textValue(pr, "mode_of_payment"); if (!mode) continue; const amount = numValue(pr, "amount"); collectedByMode.set(mode, (collectedByMode.get(mode) ?? 0) + amount); netSales += amount; if (!openingByMode.has(mode)) openingByMode.set(mode, 0); }
    }

    const payments: ShiftPaymentRow[] = [...openingByMode.keys()].sort().map((mode) => {
      const opening_amount = openingByMode.get(mode) ?? 0;
      const collected_amount = collectedByMode.get(mode) ?? 0;
      return { mode_of_payment: mode, opening_amount, collected_amount, expected_amount: opening_amount + collected_amount };
    });
    const summary: ShiftSummary = {
      openingEntry: entry, posProfile: textValue(session, "pos_profile") || settings.posProfile, user: textValue(session, "user"),
      company: textValue(session, "company"), periodStart: textValue(session, "period_start_date") || textValue(session, "posting_date") || textValue(session, "creation"),
      postingDate: textValue(session, "posting_date"), status: textValue(session, "status") || "Open",
      payments, invoiceCount, netSales, refunds: deps.db.getShiftRefundTotal(entry), totalOpening: payments.reduce((s, p) => s + p.opening_amount, 0), totalExpected: payments.reduce((s, p) => s + p.expected_amount, 0), isEstimate: true
    };
    return { success: true, summary: applyLocalRefundBreakdown(summary, entry, false), error: null };
  }

  async function getShiftSummary(input: string | Record<string, unknown> = {}): Promise<{ success: boolean; summary: ShiftSummary | null; error: string | null }> {
    const s = deps.db.loadSettings();
    const request = typeof input === "string" ? { opening_entry: input } : input;
    const openingEntry = textValue(request, "opening_entry");
    const cashierUser = textValue(request, "cashier_user");
    if (!hasUsableCredentials(deps, s) || !s.erpnextUrl) return getLocalShiftSummary(openingEntry);
    if (!openingEntry) return { success: false, summary: null, error: "Opening Entry is required." };
    if (!cashierUser) return { success: false, summary: null, error: "Cashier user is required to load closing summary." };
    try {
      const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
      const query = new URLSearchParams({ opening_entry: openingEntry, cashier_user: cashierUser });
      const r = await authFetch(deps, `${base}/api/method/aimatic.offline_pos.api.get_pos_closing_summary?${query.toString()}`);
      if (!r.ok) return { success: false, summary: null, error: await getResponseError(r) };
      const b = await r.json() as { message?: unknown };
      const raw = asRecord(b.message);
      const summary = asRecord(raw?.message) ?? raw;
      return summary ? { success: true, summary: applyLocalRefundBreakdown(summary as unknown as ShiftSummary, openingEntry, true), error: null } : { success: false, summary: null, error: "Shift summary was not returned." };
    } catch (e) {
      return { success: false, summary: null, error: e instanceof Error ? e.message : "Unable to load server shift summary." };
    }
  }

  function persistClosedShift(openingEntry: string, closingEntry: string, closingBalances: unknown[], summary: ShiftSummary | null, response: Record<string, unknown>): void {
    try {
      const actualByMode = new Map<string, number>();
      for (const row of closingBalances) { const r = asRecord(row); const mode = textValue(r, "mode_of_payment"); if (mode) actualByMode.set(mode, numValue(r, "closing_amount")); }
      const isCash = (mode: string) => mode.toLowerCase().includes("cash");
      const cashRow = summary?.payments.find((p) => isCash(p.mode_of_payment));
      const openingCash = cashRow?.opening_amount ?? summary?.totalOpening ?? 0;
      const expectedCash = cashRow?.expected_amount ?? summary?.totalExpected ?? 0;
      const actualCash = cashRow ? (actualByMode.get(cashRow.mode_of_payment) ?? 0) : [...actualByMode.values()].reduce((a, b) => a + b, 0);
      deps.db.saveShiftHistory({
        openingEntry, closingEntry: closingEntry || null, posProfile: summary?.posProfile ?? deps.db.loadSettings().posProfile,
        cashier: summary?.user ?? "", company: summary?.company ?? "", openedAt: summary?.periodStart ?? null, closedAt: new Date().toISOString(),
        openingCash, expectedCash, actualCash, difference: actualCash - expectedCash, netSales: summary?.netSales ?? 0, status: "Closed",
        summary: { summary, closing_balances: closingBalances, response }
      });
    } catch { /* shift-history persistence is best-effort; never block a successful close */ }
  }

  // Submit the POS Closing Entry via the server (aimatic.offline_pos.api.close_pos_session). Online-only.
  async function closeShift(input: Record<string, unknown>): Promise<{ success: boolean; closingEntry: string; response: Record<string, unknown> | null; error: string | null }> {
    const s = deps.db.loadSettings();
    if (!hasUsableCredentials(deps, s) || !s.erpnextUrl) return { success: false, closingEntry: "", response: null, error: "Online connection required to close shift." };
    const openingEntry = textValue(input, "opening_entry");
    const cashierUser = textValue(input, "cashier_user");
    if (!openingEntry) return { success: false, closingEntry: "", response: null, error: "Opening Entry is required to close the shift." };
    if (!cashierUser) return { success: false, closingEntry: "", response: null, error: "Cashier user is required to close the shift." };
    const closingBalances = Array.isArray(input.closing_balances) ? input.closing_balances : [];
    const notes = textValue(input, "notes");
    // Snapshot the local expected/opening figures before the close so we can persist shift history on success.
    const pre = await getShiftSummary({ opening_entry: openingEntry, cashier_user: cashierUser });
    try {
      const base = new URL(s.erpnextUrl).toString().replace(/\/+$/, "");
      const r = await authFetch(deps, `${base}/api/method/aimatic.offline_pos.api.close_pos_session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opening_entry: openingEntry, cashier_user: cashierUser, closing_balances: JSON.stringify(closingBalances), notes })
      });
      if (!r.ok) return { success: false, closingEntry: "", response: null, error: await getResponseError(r) };
      const b = await r.json() as { message?: unknown };
      const raw = asRecord(b.message);
      const response = asRecord(raw?.message) ?? raw ?? {};
      const closingEntry = textValue(response, "closing_entry") || textValue(response, "name") || textValue(asRecord(response.pos_closing_entry), "name");
      persistClosedShift(openingEntry, closingEntry, closingBalances, pre.summary, response);
      const deletedHeldSales = deps.db.deleteAllHeldSales();
      return { success: true, closingEntry, response: { ...response, deleted_held_sales: deletedHeldSales }, error: null };
    } catch (e) {
      return { success: false, closingEntry: "", response: null, error: e instanceof Error ? e.message : "Unable to close shift." };
    }
  }

  function getShiftHistoryList(): ShiftHistoryRow[] { return deps.db.listShiftHistory(100); }

  function getCachedSessionSummary(): PosSessionSummary {
    return summarizePosSession(deps.db.getCachedPosSession(deps.db.loadSettings().posProfile));
  }

  function getOfflineBatchId(hardwareId: string): string {
    const key = `offline_batch_${hardwareId}_${todayKey()}`;
    const existing = deps.db.getMeta(key);
    if (existing) return existing;
    const id = `OFFLINE-${hardwareId}-${todayKey()}-${randomUUID()}`;
    deps.db.setMeta(key, id);
    return id;
  }

  // terminalId is the shared, server-derived label for the assigned POS Profile (reporting only —
  // multiple physical terminals may share it); hardwareId is the per-install unique id used for all
  // local state keys below, so it never needs a "default-terminal" fallback (always present after
  // getOrCreateHardwareId's first run).
  function getCartIdentity(): { terminalId: string; hardwareId: string; openingEntry: string; offlineBatchId: string } {
    const settings = deps.db.loadSettings();
    const session = getCachedSessionSummary();
    const terminalId = settings.terminalId;
    const hardwareId = deps.db.getOrCreateHardwareId();
    const openingEntry = realOpeningEntry(session.openingEntry || "");
    return { terminalId, hardwareId, openingEntry, offlineBatchId: openingEntry ? "" : getOfflineBatchId(hardwareId) };
  }

  function getTerminalInvoiceId(): string {
    const id = getCartIdentity();
    return deps.db.getOpenTerminalInvoice(id.hardwareId, () => `${id.hardwareId}-${randomUUID()}`);
  }

  return {
    getPaymentMethods, summarizePosSession, syncPosSession, getActivePosSession, startPosSession,
    getLocalShiftSummary, getShiftSummary, closeShift, getShiftHistoryList, getCachedSessionSummary,
    getCartIdentity, getTerminalInvoiceId, isOfflineBatchId, getOfflineBatchId, realOpeningEntry, numValue
  };
}
