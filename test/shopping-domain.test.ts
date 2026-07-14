import assert from "node:assert/strict";
import test from "node:test";
import { addCartLine, assertCheckoutReady, cartDisplaySubtotal, cartLineId, emptyCart, quoteMatchesCart, setCartQuantity, type ShoppingQuote } from "../src/products/shopping/domain";

const now = "2026-07-15T10:00:00.000Z";
const line = { itemCode: "TEE-RED-M", itemName: "Red Tee", imageUrl: null, uom: "Nos", displayedRate: 1250, modifiers: [{ code: "SIZE", value: "M" }, { code: "COLOR", value: "Red" }] };

test("shopping cart combines the same configured product and keeps variants separate", () => {
  let cart = addCartLine(emptyCart(now), line, now);
  cart = addCartLine(cart, { ...line, quantity: 2 }, now);
  cart = addCartLine(cart, { ...line, modifiers: [{ code: "SIZE", value: "L" }, { code: "COLOR", value: "Red" }] }, now);
  assert.equal(cart.lines.length, 2);
  assert.equal(cart.lines[0].quantity, 3);
  assert.equal(cartLineId(line.itemCode, [...line.modifiers].reverse()), cart.lines[0].id);
  assert.equal(cartDisplaySubtotal(cart), 5000);
});

test("zero quantity removes a shopping cart line", () => {
  const cart = addCartLine(emptyCart(now), line, now);
  assert.equal(setCartQuantity(cart, cart.lines[0].id, 0, now).lines.length, 0);
});

test("checkout requires an unexpired server quote matching the cart", () => {
  const cart = addCartLine(emptyCart(now), line, now);
  const quote: ShoppingQuote = {
    quoteToken: "signed-quote", currency: "PKR", subtotal: 1250, discount: 0, taxes: 0, deliveryCharge: 200, grandTotal: 1450,
    expiresAt: "2026-07-15T10:15:00.000Z", lines: [{ lineId: cart.lines[0].id, itemCode: line.itemCode, quantity: 1, rate: 1250, amount: 1250, available: true }]
  };
  assert.equal(quoteMatchesCart(cart, quote), true);
  assert.doesNotThrow(() => assertCheckoutReady(cart, quote, { requestId: "device:1", quoteToken: "signed-quote", addressName: "HOME", deliveryMethod: "Delivery", paymentMethod: "Cash on Delivery" }, new Date(now)));
  assert.throws(() => assertCheckoutReady(cart, quote, { requestId: "device:2", quoteToken: "signed-quote", addressName: "HOME", deliveryMethod: "Delivery", paymentMethod: "Cash on Delivery" }, new Date("2026-07-15T10:16:00.000Z")), /expired/i);
});
