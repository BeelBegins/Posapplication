import test from "node:test";
import assert from "node:assert/strict";
import { createGiftVoucherCore, buildVoucherIssuance } from "../../src/core/gift-voucher";
import { createSaleRefundCore } from "../../src/core/sale-refund";
import { createHttpCore } from "../../src/core/http";
import { createPosSessionCore } from "../../src/core/pos-session";
import type { PosCoreDeps } from "../../src/core/types";

const rule = { name: "GVC-1", min_value: 100, max_value: 1000, minimum_skus: 2, minimum_redemption_value: 100, percentage: 5, validity_days: 30 };
const envelope = (criteria = [rule], extra = {}) => ({ payload: JSON.stringify({ version: 1, pos_profile: "P1", company: "Co", branch: "B1", time_zone: "Asia/Karachi", rounding_method: "Banker's Rounding", criteria, ...extra }), signature: "test-signature" });
const sale = { terminal_invoice_id: "terminal-unique-sale", estimated_total: 250, created_at: "2026-11-25T20:30:00Z", customer: "C1", items: [{ item_code: "A", qty: 1 }, { item_code: "B", qty: 1 }] };

function harness() {
  const meta = new Map<string, string>();
  const history = new Map<string, any>();
  const settings = { erpnextUrl: "https://erp.example", apiKey: "key", apiSecret: "secret", posProfile: "P1" };
  let current = envelope();
  let fail = false;
  let calls = 0;
  const deps = { db: {
    loadSettings: () => settings, getMeta: (key: string) => meta.get(key) ?? null, setMeta: (key: string, value: string) => meta.set(key, value),
    getOrCreateHardwareId: () => "hardware", getCachedPosSession: () => null,
    getSaleHistory: (id: string) => history.get(id) ?? null,
    saveSaleHistory: (id: string, status: string, payload: any, response: any) => history.set(id, { status, payload, response })
  }, fetch: async () => { calls++; if (fail) throw new Error("offline"); return new Response(JSON.stringify({ message: current }), { status: 200 }); } } as unknown as PosCoreDeps;
  const vouchers = createGiftVoucherCore(deps);
  const http = createHttpCore(deps);
  const sales = createSaleRefundCore(deps, http, createPosSessionCore(deps));
  return { vouchers, sales, history, settings, setRules: (rules: typeof rule[]) => { current = envelope(rules); }, fail: () => { fail = true; }, calls: () => calls };
}

test("issuance mirrors SKU, highest bracket, floor and inclusive endpoints", async () => {
  assert.equal((await buildVoucherIssuance(envelope(), sale)).amount, 12.5);
  for (const items of [[{ item_code: "A", qty: 5 }], [{ item_code: "A", qty: 1 }, { item_code: "A", qty: 1 }], [{ item_code: "A", qty: 1 }, { item_code: "B", qty: 0 }]]) {
    assert.equal((await buildVoucherIssuance(envelope(), { ...sale, items })).amount, 0);
  }
  for (const estimated_total of [100, 1000]) assert.ok(Number((await buildVoucherIssuance(envelope(), { ...sale, estimated_total })).amount) > 0);
  for (const estimated_total of [99.99, 1000.01]) assert.equal((await buildVoucherIssuance(envelope(), { ...sale, estimated_total })).criteria, "");
  assert.equal((await buildVoucherIssuance(envelope([{ ...rule, name: "higher", min_value: 200, minimum_skus: 3 }, rule]), sale)).amount, 0);
  assert.equal((await buildVoucherIssuance(envelope([{ ...rule, minimum_redemption_value: 300 }]), sale)).amount, 0);
});

test("rounding and expiry follow signed site settings and original sale day", async () => {
  const input = { ...sale, estimated_total: 250.10 };
  const bankers = await buildVoucherIssuance(envelope(), input);
  assert.equal(bankers.amount, 12.5);
  assert.equal((await buildVoucherIssuance(envelope([rule], { rounding_method: "Banker's Rounding (legacy)" }), input)).amount, 12.51);
  assert.equal((await buildVoucherIssuance(envelope([rule], { rounding_method: "Commercial Rounding" }), input)).amount, 12.51);
  assert.equal(bankers.issue_date, "2026-11-26");
  assert.equal(bankers.expiry_date, "2026-12-26");
  assert.equal(bankers.voucher_code, (await buildVoucherIssuance(envelope([]), input)).voucher_code);
  assert.match(String(bankers.voucher_code), /^OFF[A-F0-9]{24}$/);
});

test("full refresh clears disabled/deleted criteria and failures preserve last good rules", async () => {
  const h = harness();
  assert.equal((await h.vouchers.syncGiftVoucherCriteria()).count, 1);
  h.fail();
  const failed = await h.vouchers.syncGiftVoucherCriteria();
  assert.equal(failed.ready, true);
  assert.equal(failed.error, "offline");
  assert.equal((await h.vouchers.prepareGiftVoucherIssuance(sale))?.amount, 12.5);
  const cleared = harness();
  await cleared.vouchers.syncGiftVoucherCriteria();
  cleared.setRules([]);
  assert.equal((await cleared.vouchers.syncGiftVoucherCriteria()).count, 0);
  assert.equal((await cleared.vouchers.prepareGiftVoucherIssuance(sale))?.amount, 0);
  cleared.settings.posProfile = "P2";
  assert.equal(cleared.vouchers.getGiftVoucherSyncState().ready, false);
});

test("concurrent refreshes share one request", async () => {
  const h = harness();
  await Promise.all([h.vouchers.syncGiftVoucherCriteria(), h.vouchers.syncGiftVoucherCriteria()]);
  assert.equal(h.calls(), 1);
});

test("queued sale freezes code, date, amount and rules across refresh and restart", async () => {
  const h = harness();
  await h.vouchers.syncGiftVoucherCriteria();
  const first = await h.sales.queueSale(sale);
  assert.equal(first.success, true);
  assert.equal((first.response?.gift_voucher_issued as any).amount, 12.5);
  const original = h.history.get(sale.terminal_invoice_id).payload;
  h.setRules([]);
  await h.vouchers.syncGiftVoucherCriteria();
  await h.sales.queueSale({ ...sale, estimated_total: 999 });
  assert.deepEqual(h.history.get(sale.terminal_invoice_id).payload, original);
});

test("lost online response queues the exact issuance claim sent to ERP", async () => {
  const h = harness();
  await h.vouchers.syncGiftVoucherCriteria();
  h.fail();
  const result = await h.sales.submitOnlineSale(sale);
  assert.equal(result.queued, true);
  const stored = h.history.get(sale.terminal_invoice_id);
  assert.equal(stored.status, "Queued");
  for (const key of ["voucher_code", "amount", "issue_date", "expiry_date", "criteria"]) {
    assert.equal((result.response?.gift_voucher_issued as any)[key], stored.payload.gift_voucher_issuance[key]);
  }
});


test("issuance uses unrounded net sale value independently of payment rounding", async () => {
  const claim = await buildVoucherIssuance(envelope([{ ...rule, max_value: 20000, percentage: 4 }]), { ...sale, estimated_total: 16000, voucher_issuance_total: 16000.49 });
  assert.equal(claim.amount, 640.02);
});

 test("voucher brackets use unrounded value independently of collected payable", async () => {
  const result = await buildVoucherIssuance(envelope([{ ...rule, max_value: 20000 }]), { ...sale, estimated_total: 16000, voucher_issuance_total: 16000.49 });
  assert.equal(result.amount, 800.02);
});
