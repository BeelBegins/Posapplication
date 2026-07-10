import test from "node:test";
import assert from "node:assert/strict";
import { createPosSessionCore } from "../../src/core/pos-session";
import type { PosCoreDeps } from "../../src/core/types";

function fakeDeps(): PosCoreDeps {
  return {
    fetch: (() => { throw new Error("not expected to be called"); }) as unknown as typeof fetch,
    db: {} as PosCoreDeps["db"]
  };
}

test("summarizePosSession reports Not Open for a null session", () => {
  const core = createPosSessionCore(fakeDeps());
  assert.deepEqual(core.summarizePosSession(null), {
    sessionStatus: "Not Open", openingEntry: "", user: "", startDateTime: "", openingBalanceRowsCount: 0, lastSynced: null
  });
});

test("summarizePosSession maps an Open opening entry's fields", () => {
  const core = createPosSessionCore(fakeDeps());
  const summary = core.summarizePosSession({
    status: "Open", name: "OE-001", user: "cashier@example.com",
    period_start_date: "2026-01-01", period_start_time: "09:00:00",
    balance_details: [{ mode_of_payment: "Cash" }, { mode_of_payment: "Card" }]
  });
  assert.equal(summary.sessionStatus, "Open");
  assert.equal(summary.openingEntry, "OE-001");
  assert.equal(summary.startDateTime, "2026-01-01 09:00:00");
  assert.equal(summary.openingBalanceRowsCount, 2);
});

test("isOfflineBatchId recognizes OFFLINE- prefixed ids case-insensitively", () => {
  const core = createPosSessionCore(fakeDeps());
  assert.equal(core.isOfflineBatchId("offline-T1-20260101-abc"), true);
  assert.equal(core.isOfflineBatchId("OE-001"), false);
});
