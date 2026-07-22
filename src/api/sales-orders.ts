import type { ApiClient } from "./client";

export interface SalesOrderLineInput { item_code: string; qty: number; uom?: string; delivery_date?: string; }

export function createSalesOrdersApi(client: ApiClient) {
  const post = (name: string, body: Record<string, unknown> = {}) => client.callMethod(`aimatic.mobile_sales.api.${name}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  return {
    getContext: (branch?: string, warehouse?: string) => post("get_context", { branch, warehouse }),
    searchCustomers: (search: string, offset = 0, limit = 20) => post("search_customers", { search, offset, limit }),
    getCustomerContext: (customer: string, branch?: string, warehouse?: string) => post("get_customer_context", { customer, branch, warehouse }),
    searchItems: ({ assortmentOnly, ...input }: { branch?: string; warehouse?: string; customer?: string; search?: string; barcode?: string; assortmentOnly?: boolean; offset?: number; limit?: number }) => post("search_items", { ...input, assortment_only: assortmentOnly ? 1 : 0 }),
    previewOrder: (input: Record<string, unknown>) => post("preview_order", input),
    createOrder: (input: Record<string, unknown>) => post("create_order", input),
    getOrders: (customer?: string, offset = 0, limit = 20) => post("get_orders", { customer, offset, limit }),
    getRecentReorderCandidates: (limit = 3) => post("get_recent_reorder_candidates", { limit }),
    getCustomerLastOrder: (customer: string) => post("get_customer_last_order", { customer }),
    getCustomerItemHistory: (customer: string, itemCode: string, months = 3) => post("get_customer_item_history", { customer, item_code: itemCode, months }),
    getCustomerAssortment: (customer: string) => post("get_customer_assortment", { customer }),
    getCustomerDeliveryLocations: (customer: string) => post("get_customer_delivery_locations", { customer }),
    validateDiscount: (customer: string, discountPercent: number, orderTotal: number) => post("validate_discount", { customer, discount_percent: discountPercent, order_total: orderTotal }),
    requestDiscountApproval: (orderName: string, discountPercent: number, reason: string) => post("request_discount_approval", { order_name: orderName, discount_percent: discountPercent, reason }),
    getDiscountApprovals: (status = "Pending", limit = 50) => post("get_discount_approvals", { status, limit }),
    approveDiscount: (orderName: string, approved: boolean, comment = "") => post("approve_discount", { order_name: orderName, approved: approved ? 1 : 0, comment }),
    getOrder: (order: string) => post("get_order", { order }),
    updateOrder: (order: string, input: Record<string, unknown>) => post("update_order", { order, ...input })
  };
}
