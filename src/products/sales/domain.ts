import type { SalesOrderLineInput } from "../../api/sales-orders";

export type SalesDraftStatus = "draft" | "queued" | "submitted" | "failed";
export interface SalesDraft {
  requestId: string;
  branch: string;
  warehouse: string;
  customer: string;
  items: SalesOrderLineInput[];
  deliveryDate: string;
  poNo: string;
  remarks: string;
  status: SalesDraftStatus;
  error?: string;
  salesOrder?: string;
  updatedAt: string;
}

export function newSalesDraft(branch = "", now = new Date(), warehouse = ""): SalesDraft {
  const delivery = new Date(now); delivery.setDate(delivery.getDate() + 1);
  return { requestId: crypto.randomUUID(), branch, warehouse, customer: "", items: [], deliveryDate: delivery.toISOString().slice(0, 10), poNo: "", remarks: "", status: "draft", updatedAt: now.toISOString() };
}

export function setDraftItem(draft: SalesDraft, item: SalesOrderLineInput, now = new Date().toISOString()): SalesDraft {
  if (!item.item_code || !Number.isFinite(item.qty)) throw new Error("A valid item and quantity are required.");
  const items = item.qty <= 0 ? draft.items.filter(row => row.item_code !== item.item_code) : draft.items.some(row => row.item_code === item.item_code)
    ? draft.items.map(row => row.item_code === item.item_code ? { ...row, ...item } : row)
    : [...draft.items, { ...item }];
  return { ...draft, items, status: "draft", error: undefined, updatedAt: now };
}

export function assertSalesDraftReady(draft: SalesDraft): void {
  if (!draft.requestId || !draft.customer || !draft.warehouse) throw new Error("Customer and warehouse are required.");
  if (!draft.items.length || draft.items.some(item => !item.item_code || item.qty <= 0)) throw new Error("Add at least one item with a valid quantity.");
  if (!draft.deliveryDate) throw new Error("Delivery date is required.");
}

export function markDraft(draft: SalesDraft, status: SalesDraftStatus, values: Partial<Pick<SalesDraft, "error" | "salesOrder">> = {}, now = new Date().toISOString()): SalesDraft {
  return { ...draft, ...values, status, updatedAt: now };
}
