const MAX_PKR_NOTE = 5000;

/**
 * Returns the largest sensible cash tender for a PKR bill when the cashier
 * may hand over one or more Rs 5,000 notes, but should not enter absurd
 * amounts that are unrelated to the bill.
 */
export function maxCashTender(payable: number): number {
  const amount = Math.max(0, Number.isFinite(payable) ? payable : 0);
  if (amount <= 0) return 0;
  return Math.ceil(amount / MAX_PKR_NOTE) * MAX_PKR_NOTE;
}

export function exceedsCashTenderLimit(payable: number, tendered: number): boolean {
  return tendered > maxCashTender(payable) + 0.0001;
}
