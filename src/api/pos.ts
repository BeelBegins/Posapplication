import type { ApiClient } from "./client";

export function createPosApi(client: ApiClient) {
  const post = (method: string, body: Record<string, unknown>, init: RequestInit = {}) => client.callMethod(
    `aimatic.offline_pos.api.${method}`,
    { ...init, method: "POST", headers: { "Content-Type": "application/json", ...init.headers }, body: JSON.stringify(body) }
  );
  return {
    previewCart: (body: Record<string, unknown>, init?: RequestInit) => post("preview_cart", body, init),
    submitSale: (body: Record<string, unknown>, init?: RequestInit) => post("submit_online_sale", body, init),
    startSession: (body: Record<string, unknown>, init?: RequestInit) => post("start_pos_session", body, init),
    closeSession: (body: Record<string, unknown>, init?: RequestInit) => post("close_pos_session", body, init),
    submitRefund: (body: Record<string, unknown>, init?: RequestInit) => post("submit_pos_refund", body, init)
  };
}
