import assert from "node:assert/strict";
import test from "node:test";
import { exceedsCashTenderLimit, maxCashTender } from "../../src/domain/cash-tender";

test("PKR cash tender ceiling follows Rs 5,000 note steps", () => {
  assert.equal(maxCashTender(500), 5000);
  assert.equal(maxCashTender(2500), 5000);
  assert.equal(maxCashTender(5000), 5000);
  assert.equal(maxCashTender(5001), 10000);
});

test("cash tender helper preserves normal change and rejects absurd excess", () => {
  assert.equal(exceedsCashTenderLimit(500, 500), false);
  assert.equal(exceedsCashTenderLimit(500, 1000), false);
  assert.equal(exceedsCashTenderLimit(500, 5000), false);
  assert.equal(exceedsCashTenderLimit(500, 10000), true);
  assert.equal(exceedsCashTenderLimit(2500, 5000), false);
});
