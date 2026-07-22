import type { SalesOrderLineInput } from "../../api/sales-orders";

export type SalesDraftStatus = "draft" | "queued" | "syncing" | "submitted" | "failed";
export interface SalesDraft {
  requestId: string;
  branch: string;
  warehouse: string;
  customer: string;
  items: SalesOrderLineInput[];
  deliveryDate: string;
  deliveryLocation: string;
  discountPercent: number;
  discountReason: string;
  poNo: string;
  remarks: string;
  proofSignature: string;
  proofLatitude?: number;
  proofLongitude?: number;
  proofAccuracy?: number;
  proofCapturedAt?: string;
  status: SalesDraftStatus;
  error?: string;
  salesOrder?: string;
  updatedAt: string;
}

export function newSalesDraft(branch = "", now = new Date(), warehouse = ""): SalesDraft {
  const delivery = new Date(now); delivery.setDate(delivery.getDate() + 1);
  return { requestId: crypto.randomUUID(), branch, warehouse, customer: "", items: [], deliveryDate: delivery.toISOString().slice(0, 10), deliveryLocation: "", discountPercent: 0, discountReason: "", poNo: "", remarks: "", proofSignature: "", status: "draft", updatedAt: now.toISOString() };
}

export function setDraftItem(draft: SalesDraft, item: SalesOrderLineInput, now = new Date().toISOString()): SalesDraft {
  if (!item.item_code || !Number.isFinite(item.qty)) throw new Error("A valid item and quantity are required.");
  const items = item.qty <= 0 ? draft.items.filter(row => row.item_code !== item.item_code) : draft.items.some(row => row.item_code === item.item_code)
    ? draft.items.map(row => row.item_code === item.item_code ? { ...row, ...item } : row)
    : [...draft.items, { ...item }];
  return { ...draft, items, proofSignature: "", proofLatitude: undefined, proofLongitude: undefined, proofAccuracy: undefined, proofCapturedAt: undefined, status: "draft", error: undefined, updatedAt: now };
}

export function assertSalesDraftReady(draft: SalesDraft): void {
  if (!draft.requestId || !draft.customer || !draft.warehouse) throw new Error("Customer and warehouse are required.");
  if (!draft.items.length || draft.items.some(item => !item.item_code || item.qty <= 0)) throw new Error("Add at least one item with a valid quantity.");
  if (!draft.deliveryDate) throw new Error("Delivery date is required.");
}

export function markDraft(draft: SalesDraft, status: SalesDraftStatus, values: Partial<Pick<SalesDraft, "error" | "salesOrder">> = {}, now = new Date().toISOString()): SalesDraft {
  return { ...draft, ...values, status, updatedAt: now };
}

// A draft holds items for exactly one customer at a time - pricing, credit,
// and stock are all customer-specific. Re-selecting the SAME customer keeps
// the cart; switching to a genuinely different one clears it, since the
// cached item pricing (itemIndex) is cleared alongside it in the UI layer
// and stale lines would otherwise render at a zero/incorrect price until
// re-searched.
export function switchDraftCustomer(draft: SalesDraft, name: string, now = new Date().toISOString()): SalesDraft {
  const sameCustomer = draft.customer === name;
  return { ...draft, customer: name, items: sameCustomer ? draft.items : [], deliveryLocation: sameCustomer ? draft.deliveryLocation : "", discountPercent: sameCustomer ? draft.discountPercent : 0, discountReason: sameCustomer ? draft.discountReason : "", proofSignature: sameCustomer ? draft.proofSignature : "", proofLatitude: sameCustomer ? draft.proofLatitude : undefined, proofLongitude: sameCustomer ? draft.proofLongitude : undefined, proofAccuracy: sameCustomer ? draft.proofAccuracy : undefined, proofCapturedAt: sameCustomer ? draft.proofCapturedAt : undefined, status: "draft", error: undefined, updatedAt: now };
}

export function isMeaningfulSalesDraft(draft: SalesDraft): boolean {
  return Boolean(draft.customer || draft.items.length || draft.status !== "draft");
}

export function recoverInterruptedDraft(draft: SalesDraft): SalesDraft {
  return draft.status === "syncing"
    ? { ...draft, status: "queued", error: "Synchronization was interrupted before confirmation." }
    : draft;
}
