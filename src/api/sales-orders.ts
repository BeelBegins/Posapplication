import type { ApiClient } from "./client";

export interface SalesOrderLineInput { item_code: string; qty: number; uom?: string; delivery_date?: string; }

export function createSalesOrdersApi(client: ApiClient) {
  const post = (name: string, body: Record<string, unknown> = {}) => client.callMethod(`aimatic.mobile_sales.api.${name}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  return {
    getContext: (branch?: string) => post("get_context", { branch }),
    searchCustomers: (search: string, offset = 0, limit = 20) => post("search_customers", { search, offset, limit }),
    getCustomerContext: (customer: string, branch?: string) => post("get_customer_context", { customer, branch }),
    searchItems: (input: { branch?: string; customer?: string; search?: string; barcode?: string; offset?: number; limit?: number }) => post("search_items", input),
    previewOrder: (input: Record<string, unknown>) => post("preview_order", input),
    createOrder: (input: Record<string, unknown>) => post("create_order", input),
    getOrders: (customer?: string, offset = 0, limit = 20) => post("get_orders", { customer, offset, limit }),
    getOrder: (order: string) => post("get_order", { order })
  };
}
