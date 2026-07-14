import type { ApiClient } from "./client";

export function createPricingApi(client: ApiClient) {
  return {
    listItemPrices: (priceList: string, fields: string[] = ["item_code", "uom", "price_list_rate", "currency", "valid_from", "valid_upto"], init?: RequestInit) =>
      client.listResources("Item Price", { fields, filters: [["price_list", "=", priceList], ["selling", "=", 1]] }, init)
  };
}
