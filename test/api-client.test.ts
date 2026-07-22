import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "../src/api/client";
import { createSalesOrdersApi } from "../src/api/sales-orders";

test("terminal API client supplies token authentication without leaking it into URLs", async () => {
  let requestedUrl = "";
  let authorization = "";
  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get("Authorization") ?? "";
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const client = createApiClient({ baseUrl: "https://erp.example.com/", authentication: { mode: "terminal-token", apiKey: "key", apiSecret: "secret" }, fetch: mockFetch });
  await client.getResource("POS Profile", "Main POS");
  assert.equal(requestedUrl, "https://erp.example.com/api/resource/POS%20Profile/Main%20POS");
  assert.equal(authorization, "token key:secret");
  assert.equal(requestedUrl.includes("secret"), false);
});

test("session API client uses cookies and never creates a token header", async () => {
  let requestInit: RequestInit | undefined;
  const mockFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestInit = init;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const client = createApiClient({ baseUrl: "https://erp.example.com", authentication: { mode: "session" }, fetch: mockFetch });
  await client.callMethod("frappe.auth.get_logged_user");
  assert.equal(requestInit?.credentials, "include");
  assert.equal(new Headers(requestInit?.headers).has("Authorization"), false);
});

test("user-session retries one 401 with a refreshed bearer token and never uses terminal credentials", async () => {
  const authorizations: string[] = [];
  const deviceIds: string[] = [];
  let refreshes = 0;
  const credentials = {
    getAccessToken: async () => "expired",
    getRequestHeaders: async () => ({ "X-Aimatic-Device-ID": "device-1", "X-Aimatic-Device-Token": "proof" }),
    refreshAccessToken: async () => { refreshes += 1; return "rotated"; }
  };
  const mockFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    authorizations.push(headers.get("Authorization") ?? "");
    deviceIds.push(headers.get("X-Aimatic-Device-ID") ?? "");
    return new Response("{}", { status: authorizations.length === 1 ? 401 : 200 });
  }) as typeof fetch;
  const client = createApiClient({ baseUrl: "https://erp.example.com", authentication: { mode: "user-session", credentials }, fetch: mockFetch });
  assert.equal((await client.callMethod("frappe.auth.get_logged_user")).status, 200);
  assert.deepEqual(authorizations, ["Bearer expired", "Bearer rotated"]);
  assert.deepEqual(deviceIds, ["device-1", "device-1"]);
  assert.equal(refreshes, 1);
  assert.equal(authorizations.some((value) => value.startsWith("token ")), false);
});


test("Sales order view, update, and cancellation use distinct restricted API actions", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const sales = createSalesOrdersApi(createApiClient({ baseUrl: "https://erp.example.com", authentication: { mode: "session" }, fetch: mockFetch }));
  await sales.getOrder("SO-1");
  await sales.updateOrder("SO-1", { remarks: "Keep this PO note" });
  await sales.cancelOrder("SO-2");
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    "/api/method/aimatic.mobile_sales.api.get_order",
    "/api/method/aimatic.mobile_sales.api.update_order",
    "/api/method/aimatic.mobile_sales.api.cancel_order",
  ]);
  assert.deepEqual(calls.map((call) => call.body), [
    { order: "SO-1" },
    { order: "SO-1", remarks: "Keep this PO note" },
    { order: "SO-2" },
  ]);
});
