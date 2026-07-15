import assert from "node:assert/strict";
import test from "node:test";
import { addMenuItem, applyKitchenTicket, canEditLine, changeUnsentQuantity, closeOrder, createKitchenTicket, nextKitchenStatus, orderTotal, requestBill, statusForOrder, type MenuItem, type RestaurantOrder } from "../src/products/restaurant/domain";

function order(): RestaurantOrder {
  return {
    name: "REST-0001", branch: "Main", floor: "Ground", table: "T-04", waiter: "waiter@example.com",
    guestCount: 3, status: "Open", posInvoice: null, modified: "2026-07-15T00:00:00Z",
    lines: [{ id: "line-1", itemCode: "BURGER", itemName: "Burger", uom: "Nos", quantity: 2, sentQuantity: 0, rate: 500, notes: "No onion", modifiers: [{ code: "CHEESE", label: "Extra cheese", price: 100 }] }]
  };
}

test("restaurant totals include modifiers for every quantity", () => {
  assert.equal(orderTotal(order()), 1200);
});

test("KOT contains only unsent quantity and makes sent lines immutable", () => {
  const initial = order();
  const ticket = createKitchenTicket(initial, "device-1:1", "KOT-0001");
  assert.equal(ticket.lines[0].quantity, 2);
  const sent = applyKitchenTicket(initial, ticket);
  assert.equal(sent.status, "Sent to Kitchen");
  assert.equal(sent.lines[0].sentQuantity, 2);
  assert.equal(canEditLine(sent, sent.lines[0]), false);
  assert.throws(() => createKitchenTicket(sent, "device-1:2"), /no new quantities/i);
});

test("bill and close transitions require kitchen dispatch and submitted invoice", () => {
  const initial = order();
  assert.throws(() => requestBill(initial), /Send all new items/);
  const sent = applyKitchenTicket(initial, createKitchenTicket(initial, "device-1:1"));
  const billed = requestBill(sent);
  assert.equal(billed.status, "Bill Requested");
  assert.throws(() => closeOrder(billed, ""), /submitted POS Invoice/);
  assert.equal(closeOrder(billed, "ACC-POS-INV-0001").status, "Closed");
});

test("waiter can add, merge, type, and remove unsent quantities", () => {
  const item: MenuItem = { code: "TEA", name: "Iced Tea", description: "", category: "Drinks", price: 300, available: true, prepMinutes: 5, station: "Bar" };
  const empty = { ...order(), lines: [] };
  const once = addMenuItem(empty, item, [], "Less ice", 2);
  const merged = addMenuItem(once, item, [], "Less ice", 1);
  assert.equal(merged.lines.length, 1);
  assert.equal(merged.lines[0].quantity, 3);
  assert.equal(changeUnsentQuantity(merged, merged.lines[0].id, 7).lines[0].quantity, 7);
  assert.equal(changeUnsentQuantity(merged, merged.lines[0].id, 0).lines.length, 0);
});

test("sent items advance through kitchen states and drive table attention", () => {
  const sent = applyKitchenTicket(order(), createKitchenTicket(order(), "device-1:3"));
  assert.equal(nextKitchenStatus("Queued"), "Preparing");
  const ready = { ...sent, lines: sent.lines.map((line) => ({ ...line, kitchenStatus: "Ready" as const })) };
  assert.equal(statusForOrder(ready), "Needs attention");
  assert.throws(() => changeUnsentQuantity(sent, sent.lines[0].id, 3), /cannot be edited/i);
});
