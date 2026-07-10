import { test } from "node:test";
import assert from "node:assert/strict";
import {
  roundMoney,
  roundQty,
  calculateFbrItem,
  calculateFbrInvoice,
  calculateFbrRefund
} from "../../src/domain/fbr-calculation";

test("roundMoney rounds to 2 decimals and guards non-finite input", () => {
  assert.equal(roundMoney(19.999), 20);
  assert.equal(roundMoney(12.344), 12.34);
  assert.equal(roundMoney(NaN), 0);
  assert.equal(roundMoney(Infinity), 0);
});

test("roundQty rounds to 3 decimals and guards non-finite input", () => {
  assert.equal(roundQty(2.3456), 2.346);
  assert.equal(roundQty(NaN), 0);
});

test("calculateFbrItem computes the inclusive-tax breakdown for a standard taxable item", () => {
  const result = calculateFbrItem({ itemCode: "ITEM-A", qty: 2, rate: 100, taxRate: 18 });
  assert.deepEqual(result, {
    itemCode: "ITEM-A",
    quantity: 2,
    inclusiveAmount: 200,
    valueExcludingTax: 169.49,
    salesTax: 30.51,
    retailPrice: 0,
    taxRate: 18,
    displayTaxRate: "18%",
    isThirdSchedule: false,
    isExempt: false,
    isZeroRated: false,
    taxCategory: null,
    hsCode: null,
    saleType: null
  });
});

test("calculateFbrItem zeroes tax for an exempt item but keeps the input rate for display", () => {
  const result = calculateFbrItem({ itemCode: "EX-1", qty: 3, rate: 50, taxRate: 18, isExempt: true });
  assert.equal(result.salesTax, 0);
  assert.equal(result.valueExcludingTax, 150);
  assert.equal(result.isExempt, true);
  assert.equal(result.taxRate, 18);
  assert.equal(result.displayTaxRate, "18%");
});

test("calculateFbrItem zeroes tax when taxRate is 0 even without an exempt flag", () => {
  const result = calculateFbrItem({ itemCode: "ZR-1", qty: 1, rate: 200, taxRate: 0 });
  assert.equal(result.salesTax, 0);
  assert.equal(result.valueExcludingTax, 200);
});

test("calculateFbrItem taxes Third Schedule items on MRP x quantity, not the sale amount", () => {
  const result = calculateFbrItem({
    itemCode: "TS-1",
    qty: 2,
    rate: 80,
    taxRate: 18,
    isThirdSchedule: true,
    mrp: 120
  });
  assert.equal(result.inclusiveAmount, 160);
  assert.equal(result.retailPrice, 240);
  assert.equal(result.salesTax, 36.61);
  assert.equal(result.valueExcludingTax, 123.39);
});

test("calculateFbrItem throws for a Third Schedule item with no MRP", () => {
  assert.throws(
    () =>
      calculateFbrItem({
        itemCode: "TS-2",
        qty: 1,
        rate: 50,
        taxRate: 18,
        isThirdSchedule: true,
        mrp: 0
      }),
    /MRP is required for Third Schedule item TS-2/
  );
});

test("calculateFbrItem prefers an explicit amount over rate * qty", () => {
  const result = calculateFbrItem({ itemCode: "OV-1", qty: 3, rate: 10, amount: 999, taxRate: 18 });
  assert.equal(result.inclusiveAmount, 999);
  assert.equal(result.salesTax, 152.39);
  assert.equal(result.valueExcludingTax, 846.61);
});

test("calculateFbrInvoice sums item totals and adds the service fee to customer payable", () => {
  const invoice = calculateFbrInvoice(
    [
      { itemCode: "ITEM-A", qty: 2, rate: 100, taxRate: 18 },
      { itemCode: "EX-1", qty: 3, rate: 50, taxRate: 18, isExempt: true }
    ],
    30
  );
  assert.equal(invoice.merchandiseTotal, 350);
  assert.equal(invoice.totalSalesTax, 30.51);
  assert.equal(invoice.totalValueExcludingTax, 319.49);
  assert.equal(invoice.serviceFee, 30);
  assert.equal(invoice.customerPayable, 380);
});

test("calculateFbrRefund negates a Third Schedule item's amounts for a credit note", () => {
  const refund = calculateFbrRefund(
    { itemCode: "TS-1", qty: 2, rate: 80, taxRate: 18, isThirdSchedule: true, mrp: 120 },
    25
  );
  assert.equal(refund.merchandiseTotal, -160);
  assert.equal(refund.totalSalesTax, -36.61);
  assert.equal(refund.totalValueExcludingTax, -123.39);
  assert.equal(refund.items[0].retailPrice, -240);
  assert.equal(refund.serviceFee, 25);
  assert.equal(refund.customerPayable, -135);
  assert.equal(refund.refundTotal, -135);
});
