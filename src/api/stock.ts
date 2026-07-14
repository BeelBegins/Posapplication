import type { ApiClient } from "./client";

export function createStockApi(client: ApiClient) {
  return {
    listWarehouseStock: (warehouse: string, fields: string[] = ["item_code", "warehouse", "actual_qty", "reserved_qty", "projected_qty"], init?: RequestInit) =>
      client.listResources("Bin", { fields, filters: [["warehouse", "=", warehouse]] }, init)
  };
}
