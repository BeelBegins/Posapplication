import type { ApiClient } from "./client";

export interface RestaurantOrderItemInput {
  itemCode: string;
  quantity: number;
  uom?: string;
  notes?: string;
  modifiers?: Array<{ code: string; label: string; price: number }>;
}

export function createRestaurantApi(client: ApiClient) {
  const method = (name: string, body: Record<string, unknown> = {}, init: RequestInit = {}) => client.callMethod(
    `aimatic.restaurant.api.${name}`,
    {
      ...init,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  return {
    getBootstrap: (branch?: string, init?: RequestInit) => method("get_restaurant_bootstrap", { branch }, init),
    getTableOrder: (table: string, init?: RequestInit) => method("get_table_order", { table }, init),
    openOrder: (input: { branch: string; floor: string; table: string; guestCount: number }, init?: RequestInit) => method("open_order", {
      branch: input.branch,
      floor: input.floor,
      table: input.table,
      guest_count: input.guestCount
    }, init),
    saveOrder: (order: string, items: RestaurantOrderItemInput[], init?: RequestInit) => method("save_order", {
      order,
      items: items.map((item) => ({
        item_code: item.itemCode,
        qty: item.quantity,
        uom: item.uom,
        notes: item.notes,
        modifiers: item.modifiers ?? []
      }))
    }, init),
    sendToKitchen: (order: string, requestId: string, init?: RequestInit) => method("send_to_kitchen", { order, request_id: requestId }, init),
    requestBill: (order: string, init?: RequestInit) => method("request_bill", { order }, init),
    closeTable: (order: string, posInvoice: string, init?: RequestInit) => method("close_table", { order, pos_invoice: posInvoice }, init)
  };
}
