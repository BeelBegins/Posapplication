import test from "node:test";
import assert from "node:assert/strict";
import { createSaleRefundCore } from "../../src/core/sale-refund";
import { createHttpCore } from "../../src/core/http";
import { createPosSessionCore } from "../../src/core/pos-session";
import type { PosCoreDeps } from "../../src/core/types";

interface FakeDb {
  meta: Map<string, string>;
  saleHistory: Map<string, { status: string; payload: Record<string, unknown>; response: Record<string, unknown> | null }>;
  refundLog: { returnInvoice: string; openingEntry: string; amount: number; mode: string }[];
}

function fakeDeps(fake: FakeDb, fetchImpl: typeof fetch): PosCoreDeps {
  return {
    fetch: fetchImpl,
    db: {
      loadSettings: () => ({ erpnextUrl: "https://example.com", apiKey: "key", apiSecret: "secret", terminalId: "T1", posProfile: "Main", branch: "Branch A", warehouse: "WH-A" }),
      getCachedPosSession: () => null,
      getOpenTerminalInvoice: (terminalId: string, createId: () => string) => createId(),
      getMeta: (key: string) => fake.meta.get(key) ?? null,
      setMeta: (key: string, value: string) => { fake.meta.set(key, value); },
      saveSaleHistory: (id: string, status: string, payload: Record<string, unknown>, response: Record<string, unknown> | null = null) => {
        fake.saleHistory.set(id, { status, payload, response });
      },
      getQueueCounts: () => ({ queued: 0, failed: 0 }),
      getQueuedSales: () => [],
      setSaleHistoryStatus: () => {},
      logRefund: (returnInvoice: string, openingEntry: string, amount: number, mode = "") => {
        fake.refundLog.push({ returnInvoice, openingEntry, amount, mode });
      },
      getCachedReceiptHtml: () => null,
      cacheReceiptHtml: () => {}
    } as unknown as PosCoreDeps["db"]
  };
}

function freshFake(): FakeDb {
  return { meta: new Map(), saleHistory: new Map(), refundLog: [] };
}

function buildCore(fake: FakeDb, fetchImpl: typeof fetch) {
  const deps = fakeDeps(fake, fetchImpl);
  const http = createHttpCore(deps);
  const posSession = createPosSessionCore(deps);
  return createSaleRefundCore(deps, http, posSession);
}

const neverCalledFetch = (() => { throw new Error("fetch should not be called in this test"); }) as unknown as typeof fetch;

test("buildSalePayload fills defaults and mints a terminal invoice id when none is provided", () => {
  const core = buildCore(freshFake(), neverCalledFetch);
  const payload = core.buildSalePayload({ customer: "CUST-1", items: [{ item_code: "ITEM-A", qty: 1 }] });
  assert.equal(payload.customer, "CUST-1");
  assert.equal(payload.pos_profile, "Main");
  assert.equal(typeof payload.terminal_invoice_id === "string" && (payload.terminal_invoice_id as string).length > 0, true);
  assert.deepEqual(payload.items, [{ item_code: "ITEM-A", qty: 1 }]);
});

test("submitOnlineSale records Submitted status and returns the server response on success", async () => {
  const fake = freshFake();
  const stubFetch = (async () => ({
    ok: true, status: 200, statusText: "OK",
    text: async () => JSON.stringify({ message: { pos_invoice: "POS-INV-1", success: true } })
  })) as unknown as typeof fetch;
  const core = buildCore(fake, stubFetch);
  const result = await core.submitOnlineSale({ customer: "CUST-1", items: [] });
  assert.equal(result.success, true);
  assert.equal(result.queued, undefined);
  assert.equal(result.response?.pos_invoice, "POS-INV-1");
  const stored = [...fake.saleHistory.values()].find((row) => row.status === "Submitted");
  assert.equal(stored !== undefined, true);
});

test("submitOnlineSale falls back to the offline queue when the network request throws", async () => {
  const fake = freshFake();
  const throwingFetch = (async () => { throw new Error("network unreachable"); }) as unknown as typeof fetch;
  const core = buildCore(fake, throwingFetch);
  const result = await core.submitOnlineSale({ customer: "CUST-1", items: [], estimated_total: 500 });
  assert.equal(result.success, true);
  assert.equal(result.queued, true);
  assert.equal(result.response?.provisional, true);
  const queued = [...fake.saleHistory.values()].find((row) => row.status === "Queued");
  assert.equal(queued !== undefined, true);
});

test("submitOnlineSale marks the sale Failed and does not queue on a non-network HTTP error", async () => {
  const fake = freshFake();
  const stubFetch = (async () => ({
    ok: false, status: 417, statusText: "Expectation Failed",
    text: async () => JSON.stringify({ message: "Insufficient stock" })
  })) as unknown as typeof fetch;
  const core = buildCore(fake, stubFetch);
  const result = await core.submitOnlineSale({ customer: "CUST-1", items: [] });
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /Insufficient stock/);
  const failed = [...fake.saleHistory.values()].find((row) => row.status === "Failed");
  assert.equal(failed !== undefined, true);
});

test("submitPosRefund logs the refund amount and payment mode locally on a successful response", async () => {
  const fake = freshFake();
  const stubFetch = (async () => ({
    ok: true, status: 200, statusText: "OK",
    text: async () => JSON.stringify({
      message: {
        success: true,
        invoice: { name: "RET-INV-1", grand_total: -150 },
        payments: [{ mode_of_payment: "Cash" }]
      }
    })
  })) as unknown as typeof fetch;
  const core = buildCore(fake, stubFetch);
  const result = await core.submitPosRefund({ pos_opening_entry: "OE-1", payments: [{ mode_of_payment: "Cash" }] });
  assert.equal(result.error, null);
  assert.equal(fake.refundLog.length, 1);
  assert.equal(fake.refundLog[0].returnInvoice, "RET-INV-1");
  assert.equal(fake.refundLog[0].amount, 150);
  assert.equal(fake.refundLog[0].mode, "Cash");
});
