import type { ApiClient } from "./client";

export function createAuthenticationApi(client: ApiClient) {
  return {
    getLoggedInUser: (init?: RequestInit) => client.callMethod("frappe.auth.get_logged_user", init),
    cashierLogin: (body: Record<string, unknown>, init: RequestInit = {}) => client.callMethod(
      "aimatic.offline_pos.api.pos_cashier_login",
      { ...init, method: "POST", headers: { "Content-Type": "application/json", ...init.headers }, body: JSON.stringify(body) }
    )
  };
}
