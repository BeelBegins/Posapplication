import type { PosCoreDeps } from "./types";
import { asRecord, getResponseError } from "./http";
import { authFetch, hasUsableCredentials } from "./auth-fetch";

function roundedMoney(value: number, method: unknown): number {
  const scaled = Number((Math.abs(value) * 100).toFixed(method === "Banker's Rounding (legacy)" ? 8 : 12));
  const floor = Math.floor(scaled);
  const tie = Math.abs(scaled - floor - 0.5) <= Math.max(Number.EPSILON, scaled * Number.EPSILON);
  const result = tie && method === "Banker's Rounding" ? floor + (floor % 2) : Math.round(scaled);
  return Math.sign(value) * result / 100;
}

export interface VoucherSnapshot { payload: string; signature: string; }
export interface VoucherSyncState { ready: boolean; lastSynced: string | null; count: number; error: string | null; }

export function parseVoucherSnapshot(raw: unknown): { snapshot: VoucherSnapshot; data: Record<string, unknown> } | null {
  const envelope = asRecord(raw);
  if (typeof envelope?.payload !== "string" || typeof envelope.signature !== "string" || !envelope.signature) return null;
  try {
    const data = asRecord(JSON.parse(envelope.payload));
    if (!data || !Array.isArray(data.criteria) || typeof data.pos_profile !== "string" || typeof data.time_zone !== "string") return null;
    return { snapshot: { payload: envelope.payload, signature: envelope.signature }, data };
  } catch { return null; }
}

export async function buildVoucherIssuance(snapshot: VoucherSnapshot, sale: Record<string, unknown>): Promise<Record<string, unknown>> {
  const parsed = parseVoucherSnapshot(snapshot);
  if (!parsed) throw new Error("Gift Voucher Criteria cache is invalid. Sync the till before issuing vouchers.");
  const total = Number(sale.voucher_issuance_total ?? sale.estimated_total);
  if (!Number.isFinite(total) || total < 0) throw new Error("Invalid sale total for gift voucher issuance.");
  const count = new Set((Array.isArray(sale.items) ? sale.items : []).map(asRecord).filter(row => row?.item_code && Number(row.qty) > 0).map(row => String(row!.item_code))).size;
  const round = (value: number) => roundedMoney(value, parsed.data.rounding_method);
  const net = round(total);
  const bracket = (parsed.data.criteria as Record<string, unknown>[]).find(row => Number(row.min_value) <= net && net <= Number(row.max_value));
  // Select the highest bracket first; failing its SKU/floor rule never falls through.
  const candidate = bracket && net >= round(Number(bracket.minimum_redemption_value)) && count >= Number(bracket.minimum_skus || 0) ? bracket : null;
  const match = candidate && round(net * Number(candidate.percentage) / 100) > 0 ? candidate : null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: String(parsed.data.time_zone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(String(sale.created_at)));
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const issueDate = `${part("year")}-${part("month")}-${part("day")}`;
  const expiry = new Date(`${issueDate}T00:00:00Z`);
  expiry.setUTCDate(expiry.getUTCDate() + Number(match?.validity_days ?? 0));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(sale.terminal_invoice_id)));
  const code = "OFF" + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("").slice(0, 24).toUpperCase();
  return { snapshot, voucher_code: code, criteria: match ? String(match.name) : "", amount: match ? round(net * Number(match.percentage) / 100) : 0,
    issue_date: issueDate, expiry_date: match ? expiry.toISOString().slice(0, 10) : "" };
}

export function createGiftVoucherCore(deps: PosCoreDeps) {
  let inFlight: Promise<VoucherSyncState> | null = null;
  let invalidation = 0;
  let realtimeNamespace: string | null = null;
  let namespaceKey = "";
  let flightKey = "";
  let pendingRevision: string | null = null;
  const key = () => {
    const s = deps.db.loadSettings();
    return `gift_voucher_criteria:${s.erpnextUrl.replace(/\/+$/, "")}:${s.posProfile}:${deps.db.getOrCreateHardwareId()}`;
  };
  function cached() {
    try {
      const raw = JSON.parse(deps.db.getMeta(key()) || "null") as Record<string, unknown> | null;
      const parsed = parseVoucherSnapshot(raw?.snapshot);
      if (!parsed || parsed.data.pos_profile !== deps.db.loadSettings().posProfile) return null;
      return { ...parsed, lastSynced: String(raw!.synced_at), revision: typeof raw!.revision === "string" ? raw!.revision : null };
    } catch { return null; }
  }
  function getGiftVoucherSyncState(): VoucherSyncState {
    const value = cached();
    return { ready: !!value, lastSynced: value?.lastSynced ?? null, count: value ? (value.data.criteria as unknown[]).length : 0, error: null };
  }
  async function fetchSnapshot(): Promise<VoucherSyncState> {
    const settings = deps.db.loadSettings();
    const cacheKey = key();
    try {
      if (!hasUsableCredentials(deps, settings) || !settings.posProfile) throw new Error("Configure ERP and POS Profile to sync Gift Voucher Criteria.");
      const query = new URLSearchParams({ pos_profile: settings.posProfile, hardware_id: deps.db.getOrCreateHardwareId() });
      const revision = cached()?.revision;
      if (revision) query.set("revision", revision);
      const response = await authFetch(deps, `${settings.erpnextUrl.replace(/\/+$/, "")}/api/method/aimatic.offline_pos.api.get_gift_voucher_criteria?${query}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(await getResponseError(response));
      const body = asRecord(await response.json());
      const message = asRecord(body?.message);
      if (cacheKey !== key()) return getGiftVoucherSyncState();
      if (typeof message?.realtime_namespace === "string") { realtimeNamespace = message.realtime_namespace; namespaceKey = cacheKey; }
      if (message?.not_modified === true) {
        if (!revision || message.revision !== revision) throw new Error("Invalid Gift Voucher Criteria revision response.");
        return getGiftVoucherSyncState();
      }
      const parsed = parseVoucherSnapshot(message);
      if (!parsed || parsed.data.pos_profile !== settings.posProfile) throw new Error("Invalid Gift Voucher Criteria response.");
      // A profile switch during a request cannot overwrite the new profile's cache.
      if (cacheKey === key()) deps.db.setMeta(cacheKey, JSON.stringify({ snapshot: parsed.snapshot, revision: typeof message?.revision === "string" ? message.revision : null, synced_at: new Date().toISOString() }));
      return getGiftVoucherSyncState();
    } catch (e) {
      return { ...getGiftVoucherSyncState(), error: e instanceof Error ? e.message : "Gift Voucher Criteria sync failed." };
    }
  }
  function syncGiftVoucherCriteria(): Promise<VoucherSyncState> {
    if (inFlight && flightKey !== key()) invalidation++;
    if (!inFlight) inFlight = (async () => {
      let state: VoucherSyncState;
      let observed: number;
      do {
        observed = invalidation;
        flightKey = key();
        state = await fetchSnapshot();
        // A change committed during this request must get a subsequent conditional
        // fetch. Failures wait for the next real signal/health contact, never loop.
      } while (!state.error && observed !== invalidation);
      return state;
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  async function prepareGiftVoucherIssuance(sale: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const value = cached();
    return value ? buildVoucherIssuance(value.snapshot, sale) : null;
  }
  function handleGiftVoucherInvalidation(event: unknown): Promise<VoucherSyncState> {
    const scope = asRecord(event);
    const settings = deps.db.loadSettings();
    const data = cached()?.data;
    if (!scope || (typeof scope.pos_profile === "string" && scope.pos_profile !== settings.posProfile)
      || (typeof scope.company === "string" && data && scope.company !== data.company)
      || (typeof scope.branch === "string" && data && scope.branch !== data.branch)) return Promise.resolve(getGiftVoucherSyncState());
    invalidation++;
    return syncGiftVoucherCriteria();
  }
  function handleGiftVoucherRevision(profile: string, revision: string, namespace?: string): Promise<VoucherSyncState> {
    if (profile !== deps.db.loadSettings().posProfile || !revision) return Promise.resolve(getGiftVoucherSyncState());
    if (namespace) { realtimeNamespace = namespace; namespaceKey = key(); }
    if (cached()?.revision === revision) return Promise.resolve(getGiftVoucherSyncState());
    if (inFlight && flightKey === key() && pendingRevision === revision) return inFlight;
    pendingRevision = revision;
    invalidation++;
    return syncGiftVoucherCriteria();
  }
  return { syncGiftVoucherCriteria, getGiftVoucherSyncState, prepareGiftVoucherIssuance,
    handleGiftVoucherInvalidation, handleGiftVoucherRevision, getVoucherRealtimeNamespace: () => namespaceKey === key() ? realtimeNamespace : null };
}
