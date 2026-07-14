import type { ApiClient } from "./client";

export function createCustomersApi(client: ApiClient) {
  return {
    getCustomer: (name: string, init?: RequestInit) => client.getResource("Customer", name, init),
    listCustomers: (fields: string[], filters?: unknown, init?: RequestInit) => client.listResources("Customer", { fields, filters }, init),
    createCustomer: (body: Record<string, unknown>, init: RequestInit = {}) => client.request(
      "/api/resource/Customer",
      { ...init, method: "POST", headers: { "Content-Type": "application/json", ...init.headers }, body: JSON.stringify(body) }
    )
  };
}
