import type { PosCoreDeps } from "./types";
import { createApiClient } from "../api/client";
import { hasUsableCredentials } from "./auth-fetch";

// ----- Pure helpers, no deps needed — used both by the bound functions below and by
// main.ts code not yet migrated into src/core/ (see the extraction plan). -----

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function textValue(record: Record<string, unknown> | null, key: string): string {
  return typeof record?.[key] === "string" ? record[key] as string : "";
}

export function sameIdentity(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function unwrapFrappePayload(value: unknown): Record<string, unknown> {
  const root = asRecord(value) ?? {};
  const first = asRecord(root.message) ?? root;
  return asRecord(first.message) ?? first;
}

// Builds an error message from an already-read body — use when the response body has been consumed elsewhere.
export function formatResponseError(status: number, statusText: string, rawBody: string): string {
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { /* non-JSON response */ }
  const messages: string[] = [];
  if (typeof body.message === "string") messages.push(body.message);
  if (typeof body._server_messages === "string") {
    try {
      const entries = JSON.parse(body._server_messages) as unknown[];
      for (const entry of entries) {
        const value = typeof entry === "string" ? JSON.parse(entry) as Record<string, unknown> : entry as Record<string, unknown>;
        if (typeof value?.message === "string") messages.push(value.message);
      }
    } catch { messages.push(body._server_messages); }
  }
  for (const key of ["exception", "exc_type", "exc"] as const) if (typeof body[key] === "string") messages.push(body[key] as string);
  const message = messages.find(Boolean) || rawBody || `HTTP ${status}: ${statusText}`;
  return `HTTP ${status}: ${message}`;
}

export async function getResponseError(response: Response): Promise<string> {
  const rawBody = await response.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { /* non-JSON response */ }
  const messages: string[] = [];
  if (typeof body.message === "string") messages.push(body.message);
  if (typeof body._server_messages === "string") {
    try {
      const entries = JSON.parse(body._server_messages) as unknown[];
      for (const entry of entries) {
        const value = typeof entry === "string" ? JSON.parse(entry) as Record<string, unknown> : entry as Record<string, unknown>;
        if (typeof value?.message === "string") messages.push(value.message);
      }
    } catch { messages.push(body._server_messages); }
  }
  for (const key of ["exception", "exc_type", "exc"] as const) if (typeof body[key] === "string") messages.push(body[key] as string);
  const message = messages.find(Boolean) || rawBody || `HTTP ${response.status}: ${response.statusText}`;
  return `HTTP ${response.status}: ${message}`;
}

// ----- Functions bound to PosCoreDeps (need deps.fetch and/or deps.db) -----

export function createHttpCore(deps: PosCoreDeps) {
  // deps.credentials is set only on Android (mobile.ts); Electron (main.ts) never sets
  // it, so this always takes the terminal-token branch there — same client, same
  // headers, as before this function existed.
  function client(baseUrl: string) {
    if (deps.credentials) {
      return createApiClient({ baseUrl, authentication: { mode: "user-session", credentials: deps.credentials }, fetch: deps.fetch });
    }
    const { apiKey, apiSecret } = deps.db.loadSettings();
    return createApiClient({ baseUrl, authentication: { mode: "terminal-token", apiKey, apiSecret }, fetch: deps.fetch });
  }

  async function testServerReachability(): Promise<{ connected: boolean }> {
    const { erpnextUrl } = deps.db.loadSettings();

    if (!erpnextUrl.trim()) {
      return { connected: false };
    }

    let endpoint: string;
    try {
      const baseUrl = new URL(erpnextUrl.trim()).toString().replace(/\/+$/, "");
      endpoint = `${baseUrl}/api/method/frappe.auth.get_logged_user`;
    } catch {
      return { connected: false };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      await deps.fetch(endpoint, { method: "GET", signal: controller.signal });
      return { connected: true };
    } catch {
      return { connected: false };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function testApiAuthentication(): Promise<{ success: boolean; loggedUser: string | null }> {
    const settings = deps.db.loadSettings();
    if (!hasUsableCredentials(deps, settings) || !settings.erpnextUrl.trim()) {
      return { success: false, loggedUser: null };
    }

    try {
      new URL(settings.erpnextUrl.trim());
    } catch {
      return { success: false, loggedUser: null };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await client(settings.erpnextUrl).callMethod("frappe.auth.get_logged_user", {
        method: "GET",
        signal: controller.signal
      });

      if (!response.ok) {
        return { success: false, loggedUser: null };
      }

      const body = await response.json() as { message?: unknown };
      if (typeof body.message !== "string" || !body.message) {
        return { success: false, loggedUser: null };
      }

      return { success: true, loggedUser: body.message };
    } catch {
      return { success: false, loggedUser: null };
    } finally {
      clearTimeout(timeout);
    }
  }

  // Routed through aimatic.offline_pos.api.get_terminal_resource rather than
  // Frappe's generic GET /api/resource/<doctype>/<name> - core DocPerm for
  // several doctypes this is called with (POS Profile, Company, Coupon Code,
  // Customer, ...) grants nothing to POS User/POS Supervisor, so the raw
  // resource endpoint 403's for a cashier terminal with only those roles.
  // get_terminal_resource is a reviewable, explicitly allowlisted read
  // instead (see that method's docstring in offline_pos/api.py).
  async function fetchErpResource(baseUrl: string, doctype: string, name: string): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const query = new URLSearchParams({ doctype, name });
      const response = await client(baseUrl).request(
        `/api/method/aimatic.offline_pos.api.get_terminal_resource?${query.toString()}`,
        { method: "GET", signal: controller.signal }
      );
      if (!response.ok) {
        throw new Error(await getResponseError(response));
      }
      const body = await response.json() as { message?: unknown };
      const document = asRecord(body.message);
      if (!document) {
        throw new Error(`ERPNext returned no ${doctype} document.`);
      }
      return document;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getLoggedInUser(baseUrl: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await client(baseUrl).callMethod("frappe.auth.get_logged_user", {
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(await getResponseError(response));
      }
      const body = await response.json() as { message?: unknown };
      if (typeof body.message !== "string" || !body.message) {
        throw new Error("ERPNext returned no logged-in user.");
      }
      return body.message;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Routed through aimatic.offline_pos.api.list_terminal_resources rather than
  // Frappe's generic GET /api/resource/<doctype> - see fetchErpResource above
  // for why. Same page-size-based pagination loop as before (a page shorter
  // than the requested length means it was the last one).
  async function fetchPagedList(baseUrl: string, doctype: string, fields: string[], filters?: unknown): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; ; start += 500) {
      const query = new URLSearchParams({
        doctype,
        fields: JSON.stringify(fields),
        limit_start: String(start),
        limit_page_length: "500"
      });
      if (filters) query.set("filters", JSON.stringify(filters));
      const response = await client(baseUrl).request(
        `/api/method/aimatic.offline_pos.api.list_terminal_resources?${query.toString()}`,
        { method: "GET" }
      );
      if (!response.ok) throw new Error(await getResponseError(response));
      const body = await response.json() as { message?: unknown };
      const page = Array.isArray(body.message) ? body.message.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row)) : [];
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }

  return { testServerReachability, testApiAuthentication, fetchErpResource, getLoggedInUser, fetchPagedList };
}
