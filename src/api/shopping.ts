import type { ApiClient } from "./client";
import type { ShoppingCart, ShoppingCheckoutInput } from "../products/shopping/domain";

export interface ShoppingCatalogQuery {
  branch?: string;
  category?: string;
  brand?: string;
  search?: string;
  offset?: number;
  limit?: number;
}

export function createShoppingApi(client: ApiClient) {
  const post = (name: string, body: Record<string, unknown> = {}, init: RequestInit = {}) => client.callMethod(
    `aimatic.shopping.api.${name}`,
    {
      ...init,
      method: "POST",
      headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(init.headers).entries()) },
      body: JSON.stringify(body)
    }
  );

  return {
    getPublicConfig: (platform = "capacitor", origin?: string, init?: RequestInit) => post("get_public_config", { platform, origin }, init),
    getStorefront: (branch?: string, init?: RequestInit) => post("get_storefront", { branch }, init),
    searchProducts: (query: ShoppingCatalogQuery, init?: RequestInit) => post("search_products", {
      branch: query.branch,
      category: query.category,
      brand: query.brand,
      search: query.search,
      offset: query.offset ?? 0,
      limit: query.limit ?? 30
    }, init),
    getProduct: (itemCode: string, branch?: string, init?: RequestInit) => post("get_product", { item_code: itemCode, branch }, init),
    getAccount: (init?: RequestInit) => post("get_customer_account", {}, init),
    registerCustomer: (customerName: string, mobileNo?: string, init?: RequestInit) => post("register_customer", { customer_name: customerName, mobile_no: mobileNo }, init),
    getAddresses: (init?: RequestInit) => post("get_addresses", {}, init),
    quoteCart: (cart: ShoppingCart, deliveryMethod?: string, addressName?: string, init?: RequestInit) => post("quote_cart", {
      branch: cart.branch,
      delivery_method: deliveryMethod,
      address_name: addressName,
      items: cart.lines.map((line) => ({
        line_id: line.id,
        item_code: line.itemCode,
        qty: line.quantity,
        uom: line.uom,
        modifiers: line.modifiers
      }))
    }, init),
    placeOrder: (input: ShoppingCheckoutInput, init?: RequestInit) => post("place_order", {
      request_id: input.requestId,
      quote_token: input.quoteToken,
      address_name: input.addressName,
      delivery_method: input.deliveryMethod,
      payment_method: input.paymentMethod
    }, init),
    getOrders: (offset = 0, limit = 20, init?: RequestInit) => post("get_orders", { offset, limit }, init),
    getOrderStatus: (order: string, init?: RequestInit) => post("get_order_status", { order }, init),
    requestAccountDeletion: (init?: RequestInit) => post("request_account_deletion", {}, init),
    getAccountDeletionStatus: (init?: RequestInit) => post("get_account_deletion_status", {}, init)
  };
}
