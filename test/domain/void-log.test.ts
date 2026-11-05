import test from "node:test";
import assert from "node:assert/strict";
import { appendVoidEvent, buildVoidEvent, filterVoidEvents, markVoidAttempts, markVoidEventsSynced, parseVoidLog, pendingVoidEvents, summarizeVoids, VOID_LOG_MAX_EVENTS, VOID_REASON_MAX_LENGTH } from "../../src/domain/void-log";

const ev = (over: Partial<Parameters<typeof buildVoidEvent>[0]> = {}, at = new Date("2026-11-04T10:00:00Z"), id = "a") =>
  buildVoidEvent({ kind: "line_void", cashierUser: "c@x.pk", authorizedBy: "cashier_privilege", openingEntry: "POS-OPE-1", lines: [{ itemCode: "I1", itemName: "Rice", uom: "Kg", qty: 1.25, rate: 160 }], ...over }, at, () => id);

test("a void event totals qty x rate and starts unsynced", () => {
  const e = ev();
  assert.equal(e.totalAmount, 200);
  assert.equal(e.lines[0].amount, 200);
  assert.equal(e.syncedAt, null);
  assert.match(e.eventId, /^VOID-/);
});

test("bad numbers become zero instead of NaN", () => {
  const e = ev({ lines: [{ itemCode: "I", qty: "abc", rate: undefined }] });
  assert.equal(e.totalAmount, 0);
});

test("append is idempotent per eventId and never drops an unsynced event at the cap", () => {
  const a = ev();
  assert.equal(appendVoidEvent(appendVoidEvent([], a), a).length, 1);
  let log = Array.from({ length: VOID_LOG_MAX_EVENTS }, (_, i) => ({ ...ev({}, new Date(Date.UTC(2026, 10, 4, 0, 0, i)), `p${i}`), syncedAt: i < 10 ? "2026-11-04T11:00:00Z" : null }));
  log = appendVoidEvent(log, ev({}, new Date("2026-11-04T12:00:00Z"), "new"), new Date("2026-11-05T00:00:00Z"));
  assert.equal(log.length, VOID_LOG_MAX_EVENTS);
  assert.equal(pendingVoidEvents(log).length, VOID_LOG_MAX_EVENTS - 9);
});

test("old synced events are pruned after 90 days, unsynced ones are kept", () => {
  const old = { ...ev({}, new Date("2026-01-01T00:00:00Z"), "old"), syncedAt: "2026-01-02T00:00:00Z" };
  const stuck = ev({}, new Date("2026-01-01T00:00:00Z"), "stuck");
  const log = appendVoidEvent([old, stuck], ev({}, new Date("2026-11-04T00:00:00Z"), "n"), new Date("2026-11-04T00:00:00Z"));
  assert.deepEqual(log.map((e) => e.eventId.split("-").pop()).sort(), ["n", "stuck"]);
});

test("sync marking, attempts, parsing and filtering", () => {
  const a = ev({}, new Date("2026-11-04T10:00:00Z"), "a"), b = ev({ cashierUser: "d@x.pk", openingEntry: "POS-OPE-2" }, new Date("2026-11-04T11:00:00Z"), "b");
  let log = markVoidEventsSynced([a, b], [a.eventId], "2026-11-04T12:00:00Z");
  assert.equal(pendingVoidEvents(log).length, 1);
  log = markVoidAttempts(log, [b.eventId]);
  assert.equal(log[1].attempts, 1);
  assert.deepEqual(parseVoidLog("not json"), []);
  assert.equal(parseVoidLog(JSON.stringify(log)).length, 2);
  assert.equal(filterVoidEvents(log, { openingEntry: "POS-OPE-2" }).length, 1);
  assert.equal(filterVoidEvents(log, { cashierUser: "C@X.PK" }).length, 1);
  assert.equal(filterVoidEvents(log, {})[0].eventId, b.eventId);
});

test("summary splits by kind", () => {
  const s = summarizeVoids([ev(), ev({ kind: "clear_cart", lines: [{ qty: 2, rate: 50 }, { qty: 1, rate: 10 }] }, undefined, "z")]);
  assert.equal(s.count, 2);
  assert.equal(s.amount, 310);
  assert.equal(s.byKind.clear_cart.amount, 110);
});

test("reason is optional, trimmed and capped like the server field", () => {
  assert.equal(ev().reason, "");
  assert.equal(ev({ reason: "  Customer changed mind  " }).reason, "Customer changed mind");
  assert.equal(ev({ reason: "x".repeat(VOID_REASON_MAX_LENGTH + 50) }).reason.length, VOID_REASON_MAX_LENGTH);
});

test("events saved before reasons existed still parse", () => {
  const old = { ...ev() } as Record<string, unknown>;
  delete old.reason;
  assert.equal(parseVoidLog(JSON.stringify([old])).length, 1);
});
