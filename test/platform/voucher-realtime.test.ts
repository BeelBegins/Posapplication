import test from "node:test";
import assert from "node:assert/strict";
import { createVoucherRealtime } from "../../src/platform/voucher-realtime";

function harness() {
  const settings = { erpnextUrl: "https://erp.example", apiKey: "key", apiSecret: "secret", posProfile: "P1" };
  let namespace: string | null = "szl";
  let reconciles = 0;
  const invalidations: unknown[] = [];
  const sockets: { url: string; options: any; handlers: Map<string, (...args: any[]) => void>; closed: boolean }[] = [];
  const service = createVoucherRealtime({ settings: () => settings, namespace: () => namespace,
    reconcile: async () => { reconciles++; }, invalidate: async event => { invalidations.push(event); },
    connect: (url, options) => {
      const socket = { url, options, handlers: new Map<string, (...args: any[]) => void>(), closed: false };
      sockets.push(socket);
      const api = { on: (event: string, listener: (...args: any[]) => void) => { socket.handlers.set(event, listener); return api; },
        removeAllListeners: () => { socket.handlers.clear(); }, disconnect: () => { socket.closed = true; } };
      return api;
    }
  });
  return { service, settings, sockets, invalidations, reconciles: () => reconciles, namespace: (value: string | null) => { namespace = value; } };
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test("one authenticated connection stays idle until change; reconnect reconciles missed changes", async () => {
  const h = harness();
  h.service.configure(); h.service.configure(); h.service.configure();
  assert.equal(h.sockets.length, 1);
  const socket = h.sockets[0];
  assert.equal(socket.url, "https://erp.example/szl");
  assert.equal(socket.options.extraHeaders.Origin, "https://erp.example");
  assert.equal(socket.options.extraHeaders["X-Frappe-Site-Name"], "szl");
  assert.equal(socket.options.extraHeaders.Authorization, "token key:secret");
  await settle();
  assert.equal(h.reconciles(), 0);
  assert.equal(h.invalidations.length, 0);
  socket.handlers.get("connect")!();
  await settle();
  assert.equal(h.reconciles(), 1);
  socket.handlers.get("gift_voucher_criteria_changed")!({ branch: "B1" });
  await settle();
  assert.deepEqual(h.invalidations, [{ branch: "B1" }]);
  socket.handlers.get("connect")!();
  await settle();
  assert.equal(h.reconciles(), 2);
});

test("settings change closes old socket and stale callbacks cannot affect the new till", async () => {
  const h = harness();
  h.service.configure();
  const stale = h.sockets[0].handlers.get("gift_voucher_criteria_changed")!;
  h.settings.posProfile = "P2";
  h.service.configure();
  assert.equal(h.sockets[0].closed, true);
  assert.equal(h.sockets.length, 2);
  stale({});
  await settle();
  assert.equal(h.invalidations.length, 0);
  h.service.stop();
  assert.equal(h.sockets[1].closed, true);
});

test("no credentials or site namespace never opens a connection", () => {
  const h = harness();
  h.namespace(null); h.service.configure();
  assert.equal(h.sockets.length, 0);
  h.namespace("szl"); h.settings.apiSecret = ""; h.service.configure();
  assert.equal(h.sockets.length, 0);
  h.namespace("https://other.example/"); h.service.configure();
  assert.equal(h.sockets.length, 0);
});
