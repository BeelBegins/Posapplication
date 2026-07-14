import type { ApiClient } from "./client";

export function createItemsApi(client: ApiClient) {
  return {
    getItem: (name: string, init?: RequestInit) => client.getResource("Item", name, init),
    listItems: (fields: string[], filters?: unknown, init?: RequestInit) => client.listResources("Item", { fields, filters }, init),
    getBarcodes: (query: URLSearchParams, init?: RequestInit) => client.request(`/api/method/aimatic.offline_pos.api.get_item_barcodes?${query}`, init),
    getUomConversions: (query: URLSearchParams, init?: RequestInit) => client.request(`/api/method/aimatic.offline_pos.api.get_uom_conversions?${query}`, init)
  };
}
