import assert from "node:assert/strict";
import test from "node:test";
import { applyKitchenTicket, canEditLine, closeOrder, createKitchenTicket, orderTotal, requestBill, type RestaurantOrder } from "../src/products/restaurant/domain";

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
