import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

// Execute actual renderer gates: source-pattern tests missed the independent
// offline payment check that rejected the correctly prepared credit marker.
const source = readFileSync(join(process.cwd(), "src/renderer/renderer.ts"), "utf8");
const ast = ts.createSourceFile("renderer.ts", source, ts.ScriptTarget.Latest, true);
function harness() {
  const input = { value: "", focus() {} };
  const message = { textContent: "", focus() {} };
  const state = {
    window: { posAPI: {
      getCachedPosConfiguration: async () => ({}),
      getCatalogTotals: async () => ({ items: 10, prices: 10 }),
      getPaymentMethods: async () => ["Food Panda Credit"],
    } },
    document: { querySelector: (selector: string): unknown => selector === "#payment-amount" ? input : selector === "#terminal-id" || selector === "#pos-profile" ? { value: "S2FP" } : ["#payment-message", "#payment-complete", "#receipt-message"].includes(selector) ? message : null },
    selectedCustomer: { name: "Foodpanda Customer" },
    isFoodpandaProfile: true, foodpandaCreditCustomer: "Foodpanda Customer", foodpandaCreditMode: "Food Panda Credit",
    cartLines: [{ sellingPrice: 1031 }], appliedBenefits: { giftVoucherCode: "" },
    paymentRows: [{ method: "Food Panda Credit", amount: 0 }],
    paymentMethods: [] as string[], selectedPaymentMethodIndex: 0,
    paymentMethodTypes: {} as Record<string, string>, paymentEditIndex: null,
    paymentPreparedVersion: 1, currentCartVersion: 1, paymentsOutdated: false,
    changeDue: 0, persisted: 0, finalized: 0, retrieved: [] as string[],
    setCartText() {}, pickString: () => "", previewNumber: () => 0,
    interpretFbr: () => ({ applicable: false, accepted: false, statusText: "Pending", invoiceNumber: "" }),
    retrieveReceipt: async (name: string) => { state.retrieved.push(name); },
    remainingAmount: () => Math.max(0, 1031 - state.paymentRows.reduce((sum, row) => sum + row.amount, 0)),
    payableAmount: () => 1031, money2: (n: number) => Math.round(n * 100) / 100,
    persistPayments: async () => { state.persisted++; },
    renderPayments() {}, refreshCashTenderHint() {}, refreshPaymentSummary() {},
    nonCashOverpayMessage: () => null, validateCashTenderRows: () => null,
    finalizePaymentReady: async () => { state.finalized++; },
    isOnline: () => false, fbrTotalsView: () => ({ giftVoucherError: "" }),
  };
  const context = createContext(state);
  const names = ["offlineLocalBlocker", "isFoodPandaCreditProfile", "isFoodPandaCreditPrepared", "addPayment", "completePaymentAllocation", "blockedSaleReason", "viewHistoryReceipt"];
  const functions = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && !!node.name && names.includes(node.name.text));
  assert.equal(functions.length, names.length);
  const code = functions.map(fn => fn.getText(ast)).join("\n");
  runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { state, input, message, run: (expression: string) => runInContext(expression, context) };
}

test("prepared Foodpanda credit passes both offline and shared submission gates with no money", async () => {
  const h = harness();
  assert.equal(h.state.remainingAmount(), 1031);
  assert.equal(await h.run("offlineLocalBlocker(true)"), null);
  assert.equal(h.run("blockedSaleReason()"), null);
});

test("ordinary unpaid offline sale still requires payment", async () => {
  const h = harness(); h.state.isFoodpandaProfile = false;
  assert.equal(await h.run("offlineLocalBlocker(true)"), "Payment is incomplete.");
});

test("credit marker for another customer or with extra rows does not bypass offline payment", async () => {
  for (const mismatch of ["customer", "extra", "mode"]) {
    const h = harness();
    if (mismatch === "customer") h.state.selectedCustomer.name = "Other";
    if (mismatch === "extra") h.state.paymentRows.push({ method: "", amount: 0 });
    if (mismatch === "mode") h.state.paymentRows[0].method = "Other";
    assert.equal(await h.run("offlineLocalBlocker(true)"), "Payment is incomplete.");
  }
});

test("offline credit still requires prepared current cart, current payment draft and catalog", async () => {
  const h = harness(); h.state.paymentPreparedVersion = 0;
  assert.equal(await h.run("offlineLocalBlocker(true)"), "Payment not prepared for current cart.");
  h.state.paymentPreparedVersion = 1; h.state.paymentsOutdated = true;
  assert.equal(await h.run("offlineLocalBlocker(true)"), "Payment draft is outdated.");
  h.state.paymentsOutdated = false;
  h.state.window.posAPI.getCatalogTotals = async () => ({ items: 0, prices: 0 });
  assert.equal(await h.run("offlineLocalBlocker(true)"), "No local item/price data.");
});

test("adding amount with empty ordinary payment list cannot recreate the extra 1031 row", async () => {
  const h = harness(); h.input.value = "1031";
  await h.run("addPayment()");
  assert.equal(h.state.paymentRows.length, 1);
  assert.equal(h.state.paymentRows[0].amount, 0);
  assert.equal(h.state.persisted, 0);
  assert.match(h.message.textContent, /Choose a payment method/);
});

test("ordinary selected payment still adds its amount", async () => {
  const h = harness(); h.state.paymentMethods = ["Card"]; h.input.value = "500";
  await h.run("addPayment()");
  assert.equal(h.state.paymentRows[1].method, "Card");
  assert.equal(h.state.paymentRows[1].amount, 500);
  assert.equal(h.state.persisted, 1);
});

test("F6 can complete a valid prepared credit marker without requiring positive payment", async () => {
  const h = harness(); await h.run("completePaymentAllocation()");
  assert.equal(h.state.finalized, 1);
  h.state.isFoodpandaProfile = false; await h.run("completePaymentAllocation()");
  assert.equal(h.state.finalized, 1);
  assert.match(h.message.textContent, /Remaining amount must be zero/);
});

test("the observed zero credit plus blank positive payment cannot be queued again", () => {
  const h = harness(); h.state.paymentRows.push({ method: "", amount: 1031 });
  assert.equal(h.state.remainingAmount(), 0);
  assert.equal(h.run("blockedSaleReason()"), "Use Credit Sale for this Foodpanda customer");
});


test("viewing a queued provisional receipt never asks ERP for its local UUID", async () => {
  const h = harness();
  await h.run('viewHistoryReceipt({status:"Queued",posInvoice:"local-uuid",response:{provisional:true},payload:{},createdAt:"2026-11-22"})');
  assert.equal(h.state.retrieved.length, 0);
  assert.match(h.message.textContent, /saved locally/);
});

test("a submitted ERP invoice still loads its authoritative receipt", async () => {
  const h = harness();
  await h.run('viewHistoryReceipt({status:"Submitted",posInvoice:"ACC-PSINV-1",response:{},payload:{},createdAt:"2026-11-22"})');
  assert.deepEqual(h.state.retrieved, ["ACC-PSINV-1"]);
});
