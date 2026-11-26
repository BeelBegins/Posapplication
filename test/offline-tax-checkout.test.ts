import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";

// Execute the real renderer functions with an offline IPC/DOM harness. Avoid
// booting Electron or copying the checkout implementation into the tests.
const renderer = ts.createSourceFile("renderer.ts", readFileSync("src/renderer/renderer.ts", "utf8"), ts.ScriptTarget.Latest, true);
const names = new Set([
  "previewNumber", "asTotalsRecord", "normalizeLocalFbrTotals", "runCartPreview",
  "scheduleCartPreview", "offlineLocalBlocker", "blockedSaleReason",
  "normalizePreviewResponse", "extractFbrTotals", "fbrTotalsDiffer",
]);
const functions = renderer.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text));
assert.equal(functions.length, names.size);
const executable = ts.transpileModule(functions.map((node) => node.getText(renderer)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const good = { success: true, errors: [], totals: {
  merchandiseTotal: 165, totalValueExcludingTax: 139.83, totalSalesTax: 25.17, serviceFee: 1, customerPayable: 166,
} };
const missingMrp = { success: false, errors: ["MRP is required for Third Schedule item EYELINER."], totals: null };

function harness(preview: () => Promise<unknown>) {
  const context = createContext({
    Error,
    window: { posAPI: {
      previewFbr: preview,
      getCachedPosConfiguration: async () => ({}),
      getCatalogTotals: async () => ({ items: 1, prices: 1 }),
      getPaymentMethods: async () => ["Cash"],
      previewCart: async () => ({ preview: { grand_total: 166, merchandise_total: 165, items: [] } }),
    }, setTimeout: (callback: () => void) => { callback(); return 1; } },
    document: { querySelector: () => ({ textContent: "SHIFT", value: "S2 Counter 2" }) },
    isOnline: () => false,
    setCartText: () => {}, showPreviewStatus: () => {}, renderServerTaxRows: () => {}, renderCart: () => {},
    fbrTotalsView: () => ({}), isFoodPandaCreditPrepared: () => false,
    remainingAmount: () => 0, nonCashOverpayMessage: () => null,
    cartLines: [{ itemCode: "EYELINER", quantity: 1, sellingPrice: 165, uom: "Pcs" }],
    currentCartVersion: 1, validatedCartVersion: -1, paymentPreparedVersion: 1,
    activePreviewPromise: null, previewStatus: "idle", previewError: "",
    serverTotals: null, localFbrTotals: null, serverTaxRows: null,
    paymentRows: [], paymentsOutdated: false, appliedBenefits: {}, selectedCustomer: { name: "Walk in" },
    shiftClosed: false, sessionState: {}, submissionInProgress: false,
    cashierSession: { user: "Cashier" }, customerBenefits: {},
    FBR_TOTAL_KEYS: ["merchandise_total", "value_excluding_tax", "total_sales_tax", "fbr_pos_service_fee", "grand_total", "rounded_total"],
  });
  runInContext(executable, context);
  return { context, run: (code: string) => runInContext(code, context) };
}

for (const [label, result] of Object.entries({
  "missing MRP": missingMrp,
  "old engine success flag with item errors": { ...good, errors: missingMrp.errors },
  "missing totals": { success: true },
})) {
  test(`offline payment and F9 are blocked for ${label}`, async () => {
    const h = harness(async () => result);
    const reason = await h.run("offlineLocalBlocker(false)");
    assert.equal(typeof reason, "string");
    assert.equal(h.context.localFbrTotals, null);
    assert.equal(h.context.validatedCartVersion, -1);
    assert.match(h.run("blockedSaleReason()"), /Cart not validated/);
    assert.equal(typeof await h.run("offlineLocalBlocker(true)"), "string");
  });
}

test("offline calculation failure discards stale server and local totals", async () => {
  const h = harness(async () => { throw new Error("Local tax engine unavailable"); });
  h.context.serverTotals = { grand_total: 1 };
  h.context.localFbrTotals = { grand_total: 1 };
  h.context.serverTaxRows = [{ description: "FBR POS Service Fee", amount: 1 }];
  assert.match(await h.run("offlineLocalBlocker(true)"), /Local tax engine unavailable/);
  assert.equal(h.context.serverTotals, null);
  assert.equal(h.context.localFbrTotals, null);
  assert.equal(h.context.serverTaxRows, null);
});

test("ERP disconnect after online validation requires a fresh local calculation", async () => {
  const h = harness(async () => missingMrp);
  h.context.previewStatus = "validated";
  h.context.validatedCartVersion = 1;
  assert.match(await h.run("offlineLocalBlocker(true)"), /MRP is required/);
});

test("valid offline cart includes merchandise and fee and permits payment", async () => {
  const h = harness(async () => good);
  assert.equal(await h.run("offlineLocalBlocker(false)"), null);
  assert.equal(h.context.localFbrTotals.grand_total, 166);
  assert.equal(h.context.previewStatus, "offline");
  h.context.paymentPreparedVersion = h.context.currentCartVersion;
  assert.equal(await h.run("offlineLocalBlocker(true)"), null);
  assert.equal(h.run("blockedSaleReason()"), null);
});

test("an older failed IPC call cannot invalidate a newer successful cart", async () => {
  let rejectOld!: (reason: Error) => void;
  let calls = 0;
  const h = harness(() => ++calls === 1 ? new Promise((_, reject) => { rejectOld = reject; }) : Promise.resolve(good));
  const old = h.run("runCartPreview(1)");
  h.context.currentCartVersion = 2;
  await h.run("runCartPreview(2)");
  rejectOld(new Error("Old failure"));
  await old;
  assert.equal(h.context.validatedCartVersion, 2);
  assert.equal(h.context.previewStatus, "offline");
  assert.equal(h.context.localFbrTotals.grand_total, 166);
});

test("online checkout can use ERP validation when local tax configuration is missing", async () => {
  const h = harness(async () => missingMrp);
  h.context.isOnline = () => true;
  await h.run("runCartPreview(1)");
  assert.equal(h.context.validatedCartVersion, 1);
  assert.equal(h.context.serverTotals.grand_total, 166);
  assert.equal(h.context.previewError, "");
});
