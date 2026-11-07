// Recovery for a queued sale the server rejected because a non-cash payment
// (card, bank, wallet) was larger than the bill. This happens when a line was
// voided after the card amount was entered. The customer is only ever charged
// the real bill on the card machine, so the till lowers that non-cash row to
// the server's own remaining payable and replays the sale.

export interface SalePaymentRow { mode_of_payment: string; amount: number }

export interface NonCashOverpayRejection { mode: string; amount: number; remaining: number }

const money2 = (value: number): number => Math.round(value * 100) / 100;

// Server text (aimatic.offline_pos.api._validate_and_set_payments):
//   Non-cash payment '{mode}' of {amount} exceeds remaining payable {remaining}
const REJECTION = /Non-cash payment\s+['‘’"`]?(.+?)['‘’"`]?\s+of\s+(-?\d[\d,]*(?:\.\d+)?)\s+exceeds remaining payable\s+(-?\d[\d,]*(?:\.\d+)?)/i;

export function parseNonCashOverpayRejection(message: string): NonCashOverpayRejection | null {
  const match = REJECTION.exec(message || "");
  if (!match) return null;
  const amount = Number(match[2].replace(/,/g, ""));
  const remaining = Number(match[3].replace(/,/g, ""));
  if (!match[1].trim() || !Number.isFinite(amount) || !Number.isFinite(remaining)) return null;
  return { mode: match[1].trim(), amount: money2(amount), remaining: money2(remaining) };
}

/**
 * Lower the rejected non-cash row to the server's remaining payable. A row
 * whose remaining is zero is dropped. Returns null (no automatic change) when
 * the rejected row cannot be found exactly, or when the change would not
 * lower the amount — so this can never raise a payment or touch cash rows.
 */
export function clampRejectedNonCashPayment(
  payments: SalePaymentRow[],
  rejection: NonCashOverpayRejection,
): SalePaymentRow[] | null {
  const index = payments.findIndex((row) =>
    String(row.mode_of_payment ?? "").trim() === rejection.mode
    && Math.abs(money2(Number(row.amount) || 0) - rejection.amount) < 0.005);
  if (index < 0) return null;
  const target = Math.max(0, money2(rejection.remaining));
  if (target >= rejection.amount - 0.005) return null;
  const adjusted = payments.map((row) => ({ ...row }));
  if (target <= 0.005) adjusted.splice(index, 1);
  else adjusted[index].amount = target;
  return adjusted.length ? adjusted : null;
}

/**
 * Mirrors the server's row-order rule: each non-cash row may not exceed what
 * is still payable after the rows before it. Cash may exceed (change).
 */
export function nonCashExceedsPayable(
  payments: { method: string; amount: number }[],
  payable: number,
  isCash: (method: string) => boolean,
): { method: string; amount: number; remaining: number } | null {
  let paid = 0;
  for (const row of payments) {
    const amount = money2(Number(row.amount) || 0);
    if (!isCash(row.method)) {
      const remaining = money2(payable - paid);
      if (amount > remaining + 0.005) return { method: row.method, amount, remaining: Math.max(0, remaining) };
    }
    paid = money2(paid + amount);
  }
  return null;
}
