import type { AppSettings } from "../db/database";
import type { PosCoreDeps } from "./types";

/**
 * The one place every ERPNext-bound fetch in src/core/ should go through.
 * `deps.credentials` is undefined for Electron (main.ts never sets it), so this
 * takes the terminal-token branch byte-for-byte as before — nothing here changes
 * Electron's request headers or behavior. Android (mobile.ts) sets `deps.credentials`
 * to opt into Bearer/OAuth-session requests with a single 401-refresh-retry.
 */
export async function authFetch(deps: PosCoreDeps, url: string, init: RequestInit = {}): Promise<Response> {
  if (deps.credentials) {
    const headers = new Headers(init.headers);
    const token = await deps.credentials.getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await deps.fetch(url, { ...init, headers });
    if (response.status !== 401) return response;

    const refreshed = await deps.credentials.refreshAccessToken();
    if (!refreshed) return response;
    headers.set("Authorization", `Bearer ${refreshed}`);
    return deps.fetch(url, { ...init, headers });
  }

  const { apiKey, apiSecret } = deps.db.loadSettings();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `token ${apiKey}:${apiSecret}`);
  return deps.fetch(url, { ...init, headers });
}

export function hasUsableCredentials(deps: PosCoreDeps, settings: AppSettings): boolean {
  if (deps.credentials) return Boolean(settings.erpnextUrl);
  return Boolean(settings.erpnextUrl && settings.apiKey && settings.apiSecret);
}
