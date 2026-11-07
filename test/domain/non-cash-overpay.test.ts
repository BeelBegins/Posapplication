import assert from "node:assert/strict";
import test from "node:test";
import { clampRejectedNonCashPayment, nonCashExceedsPayable, parseNonCashOverpayRejection } from "../../src/domain/non-cash-overpay";

test("parses the server's non-cash overpay rejection", () => {
  assert.deepEqual(
    parseNonCashOverpayRejection("HTTP 417: Non-cash payment 'Credit Card' of 4254.0 exceeds remaining payable 4159.0"),
    { mode: "Credit Card", amount: 4254, remaining: 4159 },
  );
  assert.equal(parseNonCashOverpayRejection("HTTP 417: Total payments 10 are less than the payable amount 20"), null);
});

test("lowers only the rejected card row to the remaining payable", () => {
  const rejection = { mode: "Credit Card", amount: 500, remaining: 405 };
  assert.deepEqual(
    clampRejectedNonCashPayment([{ mode_of_payment: "Credit Card", amount: 500 }], rejection),
    [{ mode_of_payment: "Credit Card", amount: 405 }],
  );
  // Split cash + card: cash row untouched, card reduced to what cash left payable.
  assert.deepEqual(
    clampRejectedNonCashPayment([{ mode_of_payment: "Cash", amount: 100 }, { mode_of_payment: "Credit Card", amount: 400 }], { mode: "Credit Card", amount: 400, remaining: 305 }),
    [{ mode_of_payment: "Cash", amount: 100 }, { mode_of_payment: "Credit Card", amount: 305 }],
  );
  // Card row with nothing left to pay is dropped, cash still covers the bill.
  assert.deepEqual(
    clampRejectedNonCashPayment([{ mode_of_payment: "Cash", amount: 500 }, { mode_of_payment: "Credit Card", amount: 50 }], { mode: "Credit Card", amount: 50, remaining: 0 }),
    [{ mode_of_payment: "Cash", amount: 500 }],
  );
});

test("never raises a payment, guesses a row, or empties the payments", () => {
  assert.equal(clampRejectedNonCashPayment([{ mode_of_payment: "Credit Card", amount: 500 }], { mode: "Credit Card", amount: 499, remaining: 400 }), null);
  assert.equal(clampRejectedNonCashPayment([{ mode_of_payment: "Credit Card", amount: 500 }], { mode: "Credit Card", amount: 500, remaining: 600 }), null);
  assert.equal(clampRejectedNonCashPayment([{ mode_of_payment: "Credit Card", amount: 500 }], { mode: "Credit Card", amount: 500, remaining: 0 }), null);
});

test("detects a card amount above the bill using the server row-order rule", () => {
  const isCash = (m: string) => m === "Cash";
  assert.deepEqual(nonCashExceedsPayable([{ method: "Credit Card", amount: 500 }], 405, isCash), { method: "Credit Card", amount: 500, remaining: 405 });
  assert.equal(nonCashExceedsPayable([{ method: "Credit Card", amount: 405 }], 405, isCash), null);
  assert.equal(nonCashExceedsPayable([{ method: "Cash", amount: 1000 }], 405, isCash), null);
});
