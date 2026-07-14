import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "../src/api/client";

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
  let refreshes = 0;
  const credentials = { getAccessToken: async () => "expired", refreshAccessToken: async () => { refreshes += 1; return "rotated"; } };
  const mockFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    authorizations.push(new Headers(init?.headers).get("Authorization") ?? "");
    return new Response("{}", { status: authorizations.length === 1 ? 401 : 200 });
  }) as typeof fetch;
  const client = createApiClient({ baseUrl: "https://erp.example.com", authentication: { mode: "user-session", credentials }, fetch: mockFetch });
  assert.equal((await client.callMethod("frappe.auth.get_logged_user")).status, 200);
  assert.deepEqual(authorizations, ["Bearer expired", "Bearer rotated"]);
  assert.equal(refreshes, 1);
  assert.equal(authorizations.some((value) => value.startsWith("token ")), false);
});
