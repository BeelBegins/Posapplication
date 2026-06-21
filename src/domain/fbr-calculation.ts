export interface FbrItemInput {
  itemCode: string;
  qty: number;
  rate: number;
  amount?: number | null;
  taxRate: number;
  isExempt?: boolean;
  isZeroRated?: boolean;
  isThirdSchedule?: boolean;
  mrp?: number | null;
  taxCategory?: string | null;
  hsCode?: string | null;
  saleType?: string | null;
}

export interface FbrItemCalculation {
  itemCode: string;
  quantity: number;
  inclusiveAmount: number;
  valueExcludingTax: number;
  salesTax: number;
  retailPrice: number;
  taxRate: number;
  displayTaxRate: string;
  isThirdSchedule: boolean;
  isExempt: boolean;
  isZeroRated: boolean;
  taxCategory: string | null;
  hsCode: string | null;
  saleType: string | null;
}

export interface FbrInvoiceCalculation {
  items: FbrItemCalculation[];
  merchandiseTotal: number;
  totalSalesTax: number;
  totalValueExcludingTax: number;
  serviceFee: number;
  customerPayable: number;
}

export interface FbrRefundCalculation extends FbrInvoiceCalculation {
  refundTotal: number;
}

export function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function roundQty(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

export function calculateFbrItem(item: FbrItemInput): FbrItemCalculation {
  const quantity = roundQty(Math.abs(item.qty || 0));
  const inclusiveAmount = roundMoney(Math.abs(item.amount ?? (item.rate * item.qty)));
  const taxRate = Math.max(0, item.taxRate || 0);
  const isExempt = Boolean(item.isExempt);
  const isZeroRated = Boolean(item.isZeroRated);
  const isThirdSchedule = Boolean(item.isThirdSchedule);

  if (isExempt || isZeroRated || taxRate <= 0) {
    return {
      itemCode: item.itemCode,
      quantity,
      inclusiveAmount,
      valueExcludingTax: inclusiveAmount,
      salesTax: 0,
      retailPrice: 0,
      taxRate,
      displayTaxRate: `${taxRate}%`,
      isThirdSchedule,
      isExempt,
      isZeroRated,
      taxCategory: item.taxCategory ?? null,
      hsCode: item.hsCode ?? null,
      saleType: item.saleType ?? null
    };
  }

  let retailPrice = 0;
  let taxableBase = inclusiveAmount;
  if (isThirdSchedule) {
    if (!item.mrp || item.mrp <= 0) {
      throw new Error(`MRP is required for Third Schedule item ${item.itemCode}.`);
    }
    retailPrice = roundMoney(item.mrp * quantity);
    taxableBase = retailPrice;
  }

  const salesTax = roundMoney(taxableBase * taxRate / (100 + taxRate));
  return {
    itemCode: item.itemCode,
    quantity,
    inclusiveAmount,
    valueExcludingTax: roundMoney(inclusiveAmount - salesTax),
    salesTax,
    retailPrice,
    taxRate,
    displayTaxRate: `${taxRate}%`,
    isThirdSchedule,
    isExempt,
    isZeroRated,
    taxCategory: item.taxCategory ?? null,
    hsCode: item.hsCode ?? null,
    saleType: item.saleType ?? null
  };
}

export function calculateFbrInvoice(items: FbrItemInput[], serviceFee: number): FbrInvoiceCalculation {
  const calculatedItems = items.map(calculateFbrItem);
  const merchandiseTotal = roundMoney(calculatedItems.reduce((sum, item) => sum + item.inclusiveAmount, 0));
  const totalSalesTax = roundMoney(calculatedItems.reduce((sum, item) => sum + item.salesTax, 0));
  const totalValueExcludingTax = roundMoney(calculatedItems.reduce((sum, item) => sum + item.valueExcludingTax, 0));
  const fee = roundMoney(Math.abs(serviceFee || 0));
  return {
    items: calculatedItems,
    merchandiseTotal,
    totalSalesTax,
    totalValueExcludingTax,
    serviceFee: fee,
    customerPayable: roundMoney(merchandiseTotal + fee)
  };
}

export function calculateFbrRefund(item: FbrItemInput, serviceFee: number): FbrRefundCalculation {
  const original = calculateFbrItem(item);
  const fee = roundMoney(Math.abs(serviceFee || 0));
  const refundItem: FbrItemCalculation = {
    ...original,
    inclusiveAmount: roundMoney(-original.inclusiveAmount),
    valueExcludingTax: roundMoney(-original.valueExcludingTax),
    salesTax: roundMoney(-original.salesTax),
    retailPrice: roundMoney(-original.retailPrice)
  };
  return {
    items: [refundItem],
    merchandiseTotal: refundItem.inclusiveAmount,
    totalSalesTax: refundItem.salesTax,
    totalValueExcludingTax: refundItem.valueExcludingTax,
    serviceFee: fee,
    customerPayable: roundMoney(refundItem.inclusiveAmount + fee),
    refundTotal: roundMoney(refundItem.inclusiveAmount + fee)
  };
}
