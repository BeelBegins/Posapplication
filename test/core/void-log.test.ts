import test from "node:test";
import assert from "node:assert/strict";
import { createVoidLogCore } from "../../src/core/void-log";
import type { PosCoreDeps } from "../../src/core/types";

function make(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  const meta = new Map<string, string>();
  const deps = {
    fetch: fetchImpl as unknown as typeof fetch,
    db: {
      getMeta: (k: string) => meta.get(k) ?? null, setMeta: (k: string, v: string) => { meta.set(k, v); },
      loadSettings: () => ({ erpnextUrl: "https://erp.example.com", apiKey: "k", apiSecret: "s", posProfile: "S1" })
    } as unknown as PosCoreDeps["db"]
  } as PosCoreDeps;
  return createVoidLogCore(deps, () => ({ terminalId: "T1", hardwareId: "H1", openingEntry: "POS-OPE-1" }));
}
const input = { kind: "line_void" as const, cashierUser: "c@x.pk", authorizedBy: "cashier_privilege" as const, lines: [{ itemCode: "I1", itemName: "Rice", uom: "Kg", qty: 2, rate: 100 }] };

test("a void is stored locally with till identity even when the server is unreachable", async () => {
  const core = make(async () => { throw new TypeError("offline"); });
  assert.equal(core.recordVoid(input).ok, true);
  const { events, pending, summary } = core.listVoids({});
  assert.equal(events[0].terminalId, "T1");
  assert.equal(events[0].openingEntry, "POS-OPE-1");
  assert.equal(pending, 1);
  assert.equal(summary.amount, 200);
  const result = await core.syncVoids();
  assert.equal(result.remaining, 1);
  assert.ok(result.error);
});

test("a 404 (server not updated yet) keeps everything queued with a clear message", async () => {
  const core = make(async () => new Response("not found", { status: 404 }));
  core.recordVoid(input);
  const result = await core.syncVoids();
  assert.match(result.error ?? "", /does not have the void log endpoint/);
  assert.equal(core.listVoids({}).pending, 1);
  assert.equal(core.listVoids({}).events[0].attempts, 1);
});

test("accepted events are marked synced and not sent again", async () => {
  let calls = 0; let sentBody = "";
  const core = make(async (_url, init) => {
    calls += 1; sentBody = String(init?.body ?? "");
    const events = JSON.parse(JSON.parse(sentBody).events) as Array<{ eventId: string }>;
    return new Response(JSON.stringify({ message: { accepted: events.map((e) => e.eventId) } }), { status: 200 });
  });
  core.recordVoid(input);
  const first = await core.syncVoids();
  assert.equal(first.sent, 1);
  assert.equal(first.remaining, 0);
  assert.equal(first.error, null);
  assert.ok(!sentBody.includes("syncedAt"));
  await core.syncVoids();
  assert.equal(calls, 1);
});

test("a partial answer leaves the unaccepted events pending", async () => {
  const core = make(async () => new Response(JSON.stringify({ message: { accepted: [] } }), { status: 200 }));
  core.recordVoid(input);
  const result = await core.syncVoids();
  assert.equal(result.remaining, 1);
  assert.match(result.error ?? "", /every void/);
});
