import test from "node:test";
import assert from "node:assert/strict";
import { asRecord, textValue, sameIdentity, unwrapFrappePayload, formatResponseError } from "../../src/core/http";

test("asRecord accepts plain objects and rejects arrays/primitives/null", () => {
  assert.deepEqual(asRecord({ a: 1 }), { a: 1 });
  assert.equal(asRecord([1, 2]), null);
  assert.equal(asRecord("x"), null);
  assert.equal(asRecord(null), null);
});

test("textValue reads a string field and defaults to empty string otherwise", () => {
  assert.equal(textValue({ name: "Item A" }, "name"), "Item A");
  assert.equal(textValue({ name: 42 }, "name"), "");
  assert.equal(textValue(null, "name"), "");
});

test("sameIdentity compares case-insensitively and ignores surrounding whitespace", () => {
  assert.equal(sameIdentity(" Admin ", "admin"), true);
  assert.equal(sameIdentity("Admin", "Administrator"), false);
});

test("unwrapFrappePayload unwraps one or two layers of Frappe's {message: ...} envelope", () => {
  assert.deepEqual(unwrapFrappePayload({ message: { session: "x" } }), { session: "x" });
  assert.deepEqual(unwrapFrappePayload({ message: { message: { session: "y" } } }), { session: "y" });
  assert.deepEqual(unwrapFrappePayload({ session: "z" }), { session: "z" });
});

test("formatResponseError prefers a server-supplied message over the raw body", () => {
  const message = formatResponseError(417, "Expectation Failed", JSON.stringify({ message: "Insufficient stock" }));
  assert.equal(message, "HTTP 417: Insufficient stock");
});

test("formatResponseError falls back to raw body text for a non-JSON response", () => {
  const message = formatResponseError(500, "Internal Server Error", "upstream timeout");
  assert.equal(message, "HTTP 500: upstream timeout");
});
