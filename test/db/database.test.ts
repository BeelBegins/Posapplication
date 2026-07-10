import { mock } from "node:test";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// database.ts imports Electron's `app` at module scope (for app.getPath("userData")).
// Under ELECTRON_RUN_AS_NODE, require("electron") only returns a path string, not the
// real app API, so app.getPath must be mocked before database.ts is first required.
// This must run before the require() below — see docs/architecture.md's Electron
// security model for why database.ts can't be imported outside a real/mocked Electron.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pos-db-test-"));
mock.module("electron", { namedExports: { app: { getPath: () => tmpDir } } });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const db = require("../../src/db/database") as typeof import("../../src/db/database");

db.initDatabase();

after(() => {
  // better-sqlite3 holds the file open; Windows can't unlink an open file (EBUSY),
  // so the handle must be released before rmSync.
  db.closeDatabase();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("initDatabase runs the schema baseline and every migration to the latest version", () => {
  const status = db.getDatabaseStatus();
  assert.equal(status.isReady, true);
  assert.equal(status.schemaVersion, "3");
});

test("initDatabase is idempotent — calling it again does not throw or reset state", () => {
  db.saveSettings({
    erpnextUrl: "https://example.com",
    apiKey: "key-1",
    apiSecret: "secret-1",
    terminalId: "T1",
    posProfile: "Main",
    branch: "Branch A",
    warehouse: "WH-A"
  });
  db.initDatabase();
  const settings = db.loadSettings();
  assert.equal(settings.apiKey, "key-1");
});

test("normalizeErpnextUrl defaults to https, strips trailing slashes and invisible characters", () => {
  assert.equal(db.normalizeErpnextUrl("example.com"), "https://example.com");
  assert.equal(db.normalizeErpnextUrl("https://example.com///"), "https://example.com");
  assert.equal(db.normalizeErpnextUrl("  https://example.com ​"), "https://example.com");
  assert.equal(db.normalizeErpnextUrl(""), "");
});

test("saveSettings + getSettingsForRenderer never leaks the raw API secret to the renderer", () => {
  db.saveSettings({
    erpnextUrl: "erpnext.local",
    apiKey: "rk-1",
    apiSecret: "top-secret",
    terminalId: "T2",
    posProfile: "Counter 2",
    branch: "Branch B",
    warehouse: "WH-B"
  });
  const rendererSettings = db.getSettingsForRenderer() as unknown as Record<string, unknown>;
  assert.equal(rendererSettings.hasApiSecret, true);
  assert.equal("apiSecret" in rendererSettings, false);
  assert.equal(rendererSettings.erpnextUrl, "https://erpnext.local");
});

test("saveSettings keeps a previously saved API secret when a blank one is submitted", () => {
  db.saveSettings({
    erpnextUrl: "erpnext.local",
    apiKey: "rk-1",
    apiSecret: "",
    terminalId: "T2",
    posProfile: "Counter 2",
    branch: "Branch B",
    warehouse: "WH-B"
  });
  assert.equal(db.loadSettings().apiSecret, "top-secret");
});

test("held sales: hold, list, fetch, rename, and delete round-trip correctly", () => {
  const held = db.holdSale({
    terminalInvoiceId: "TI-HOLD-1",
    displayName: "Table 4",
    customer: "CUST-1",
    customerName: "Walk-in",
    posProfile: "Main",
    company: "Test Co",
    branch: "Branch A",
    openingEntry: "OE-1",
    cart: [{ itemCode: "ITEM-A", qty: 2 }],
    payments: [],
    benefits: { loyaltyPoints: 0 },
    totals: { grandTotal: 200 },
    validationSnapshot: { valid: true },
    itemCount: 1,
    estimatedTotal: 200
  });
  assert.equal(held.displayName, "Table 4");

  const listed = db.listHeldSales();
  assert.equal(listed.some((row) => row.id === held.id), true);

  const detail = db.getHeldSale(held.id);
  assert.equal(detail?.terminalInvoiceId, "TI-HOLD-1");
  assert.deepEqual(detail?.cart, [{ itemCode: "ITEM-A", qty: 2 }]);
  assert.deepEqual(detail?.totals, { grandTotal: 200 });

  db.renameHeldSale(held.id, "Table 4 - renamed");
  assert.equal(db.getHeldSale(held.id)?.displayName, "Table 4 - renamed");

  db.deleteHeldSale(held.id);
  assert.equal(db.getHeldSale(held.id), null);
  assert.equal(db.listHeldSales().some((row) => row.id === held.id), false);
});

test("deleteAllHeldSales only clears status='Held' rows and reports the count removed", () => {
  const a = db.holdSale({
    terminalInvoiceId: "TI-HOLD-A", displayName: "A", customer: "", customerName: "",
    posProfile: "Main", company: "Test Co", branch: "Branch A", openingEntry: "OE-1",
    cart: [], payments: [], benefits: {}, totals: {}, validationSnapshot: {}, itemCount: 0, estimatedTotal: 0
  });
  const b = db.holdSale({
    terminalInvoiceId: "TI-HOLD-B", displayName: "B", customer: "", customerName: "",
    posProfile: "Main", company: "Test Co", branch: "Branch A", openingEntry: "OE-1",
    cart: [], payments: [], benefits: {}, totals: {}, validationSnapshot: {}, itemCount: 0, estimatedTotal: 0
  });
  const removed = db.deleteAllHeldSales();
  assert.equal(removed >= 2, true);
  assert.equal(db.getHeldSale(a.id), null);
  assert.equal(db.getHeldSale(b.id), null);
});

test("getOpenTerminalInvoice is idempotent for the same terminal — never mints a second invoice id", () => {
  let createIdCalls = 0;
  const createId = () => { createIdCalls += 1; return `TI-OPEN-${createIdCalls}`; };

  const first = db.getOpenTerminalInvoice("TERM-IDEMPOTENT", createId);
  const second = db.getOpenTerminalInvoice("TERM-IDEMPOTENT", createId);

  assert.equal(first, second);
  assert.equal(createIdCalls, 1);
});

test("saveSaleHistory + getSaleHistory + recordReprint track status and reprint count", () => {
  db.saveSaleHistory("TI-HIST-1", "Queued", { terminal_id: "T1" });
  assert.equal(db.getSaleHistory("TI-HIST-1")?.status, "Queued");

  db.saveSaleHistory("TI-HIST-1", "Submitted", { terminal_id: "T1" }, { pos_invoice: "POS-INV-1" });
  const submitted = db.getSaleHistory("TI-HIST-1");
  assert.equal(submitted?.status, "Submitted");
  assert.equal(submitted?.posInvoice, "POS-INV-1");
  assert.equal(submitted?.submittedAt !== null, true);

  const reprint = db.recordReprint("TI-HIST-1");
  assert.equal(reprint.reprintCount, 1);
  assert.equal(db.recordReprint("TI-HIST-1").reprintCount, 2);
});

test("getQueueCounts reflects Queued/Failed rows and getQueuedSales replays oldest-first", () => {
  db.saveSaleHistory("TI-QUEUE-1", "Queued", { terminal_id: "T1", seq: 1 });
  db.saveSaleHistory("TI-QUEUE-2", "Queued", { terminal_id: "T1", seq: 2 });
  db.saveSaleHistory("TI-QUEUE-3", "Failed", { terminal_id: "T1", seq: 3 });

  const counts = db.getQueueCounts();
  assert.equal(counts.queued >= 2, true);
  assert.equal(counts.failed >= 1, true);

  const queued = db.getQueuedSales();
  const queue1Index = queued.findIndex((row) => row.terminalInvoiceId === "TI-QUEUE-1");
  const queue2Index = queued.findIndex((row) => row.terminalInvoiceId === "TI-QUEUE-2");
  assert.equal(queue1Index >= 0 && queue2Index >= 0, true);
  assert.equal(queue1Index < queue2Index, true);
});

test("refund log: getShiftRefundTotal sums and getShiftRefundBreakdown groups by mode of payment", () => {
  db.logRefund("RET-INV-1", "OE-SHIFT-1", 100, "Cash");
  db.logRefund("RET-INV-2", "OE-SHIFT-1", 50, "Card");
  db.logRefund("RET-INV-3", "OE-SHIFT-1", 25, "Cash");

  assert.equal(db.getShiftRefundTotal("OE-SHIFT-1"), 175);

  const breakdown = db.getShiftRefundBreakdown("OE-SHIFT-1");
  assert.equal(breakdown.Cash, 125);
  assert.equal(breakdown.Card, 50);
});

test("logRefund stores the absolute value of amount, regardless of sign", () => {
  db.logRefund("RET-INV-NEG", "OE-SHIFT-NEG", -40, "Cash");
  assert.equal(db.getShiftRefundTotal("OE-SHIFT-NEG"), 40);
});

test("cart state and payment/benefits drafts round-trip per cart key", () => {
  db.saveCartState("TERM-CART", "OE-CART", [{ itemCode: "ITEM-A", qty: 3 }]);
  assert.deepEqual(db.loadCartState("TERM-CART", "OE-CART").lines, [{ itemCode: "ITEM-A", qty: 3 }]);

  const cartKey = db.loadCartState("TERM-CART", "OE-CART").cartKey;
  db.savePaymentDraft(cartKey, [{ mode: "Cash", amount: 100 }]);
  assert.deepEqual(db.loadPaymentDraft(cartKey), [{ mode: "Cash", amount: 100 }]);

  db.saveBenefitsDraft(cartKey, { loyaltyPoints: 10 });
  assert.deepEqual(db.loadBenefitsDraft(cartKey), { loyaltyPoints: 10 });
});
