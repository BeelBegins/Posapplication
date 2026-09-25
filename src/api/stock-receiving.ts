import type { ApiClient } from "./client";

export interface StockReceivingApi {
  getContext(): Promise<Response>;
  listPending(limit?: number): Promise<Response>;
  getDocument(sourceType: string, name: string): Promise<Response>;
  submitReceiving(input: { source_type: string; name: string; items: unknown[]; remarks: string; idempotency_key: string }): Promise<Response>;
}

export function createStockReceivingApi(client: ApiClient): StockReceivingApi {
  const json = (body: Record<string, unknown>): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return {
    getContext: () => client.callMethod("aimatic.stock_receiving.api.get_context", json({})),
    listPending: (limit = 200) => client.callMethod("aimatic.stock_receiving.api.list_pending", json({ limit })),
    getDocument: (sourceType, name) => client.callMethod("aimatic.stock_receiving.api.get_document", json({ source_type: sourceType, name })),
    submitReceiving: (input) => client.callMethod("aimatic.stock_receiving.api.submit_receiving", json(input as Record<string, unknown>))
  };
}
