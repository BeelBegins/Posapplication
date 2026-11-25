import { io } from "socket.io-client";

interface RealtimeSocket {
  on(event: string, listener: (...args: any[]) => void): RealtimeSocket;
  removeAllListeners(): void;
  disconnect(): void;
}

interface RealtimeOptions {
  transports: ["websocket"];
  extraHeaders: Record<string, string>;
  reconnectionDelay: number;
  reconnectionDelayMax: number;
  randomizationFactor: number;
}

export interface VoucherRealtimeDeps {
  settings: () => { erpnextUrl: string; apiKey: string; apiSecret: string; posProfile: string };
  namespace: () => string | null;
  reconcile: () => Promise<unknown>;
  invalidate: (event: unknown) => Promise<unknown> | unknown;
  connect?: (url: string, options: RealtimeOptions) => RealtimeSocket;
}

/** Electron main only: credentials never cross the renderer bridge. Frappe's
 * authenticated site namespace provides notifications, not voucher payloads.
 * Socket.IO heartbeats maintain the transport; idle connections don't sync rules.
 */
export function createVoucherRealtime(deps: VoucherRealtimeDeps) {
  let socket: RealtimeSocket | null = null;
  let identity = "";

  function stop() {
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
    identity = "";
  }

  function configure() {
    const settings = deps.settings();
    const namespace = deps.namespace();
    if (!namespace || /[/?#]/.test(namespace) || !settings.erpnextUrl || !settings.apiKey || !settings.apiSecret || !settings.posProfile) {
      stop();
      return;
    }
    let base: URL;
    try { base = new URL(settings.erpnextUrl); } catch { stop(); return; }
    const nextIdentity = JSON.stringify([base.origin, namespace, settings.posProfile, settings.apiKey, settings.apiSecret]);
    if (nextIdentity === identity) return;
    stop();
    identity = nextIdentity;
    const activeIdentity = identity;
    const connect = deps.connect ?? ((url, options) => io(url, options));
    socket = connect(`${base.origin}/${encodeURIComponent(namespace)}`, {
      transports: ["websocket"],
      extraHeaders: {
        Authorization: `token ${settings.apiKey}:${settings.apiSecret}`,
        Origin: base.origin,
        "X-Frappe-Site-Name": namespace
      },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5
    });
    socket.on("connect", () => {
      if (identity === activeIdentity) void deps.reconcile().catch(() => {});
    });
    socket.on("gift_voucher_criteria_changed", (event: unknown) => {
      if (identity === activeIdentity) void Promise.resolve().then(() => deps.invalidate(event)).catch(() => {});
    });
    // Connectivity/revision reconciliation also runs through the existing health
    // request. A failed socket must never interrupt checkout or erase offline data.
    socket.on("connect_error", () => {});
  }

  return { configure, stop };
}
