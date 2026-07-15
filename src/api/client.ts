/**
 * Implemented per-platform/per-product: Android's OAuth2 PKCE cashier session
 * (src/mobile/credential-provider.ts) and, later, Shopping's customer session
 * both satisfy this same shape, so src/api/client.ts never needs to change
 * again when a new session-based product is added.
 */
export interface CredentialProvider {
  getAccessToken(): Promise<string | null>;
  /** Product/platform headers such as Android's enrolled-device proof. */
  getRequestHeaders?(): Promise<Record<string, string>>;
  /** Returns the new access token, or null if refresh failed (caller must re-authenticate — never falls back to any other credential). */
  refreshAccessToken(): Promise<string | null>;
}

export type ApiAuthentication =
  | { mode: "terminal-token"; apiKey: string; apiSecret: string }
  | { mode: "user-session"; credentials: CredentialProvider }
  | { mode: "customer-session"; credentials: CredentialProvider }
  | { mode: "session" };

export interface ApiClientOptions {
  baseUrl: string;
  authentication: ApiAuthentication;
  fetch: typeof fetch;
}

export interface ResourceListOptions {
  fields: string[];
  filters?: unknown;
  limitStart?: number;
  limitPageLength?: number;
}

function normalizeBaseUrl(value: string): string {
  return new URL(value).toString().replace(/\/+$/, "");
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const auth = options.authentication;

  async function authenticationHeaders(): Promise<Record<string, string>> {
    if (auth.mode === "session") return {};
    if (auth.mode === "terminal-token") {
      if (!auth.apiKey || !auth.apiSecret) throw new Error("Terminal API credentials are required.");
      return { Authorization: `token ${auth.apiKey}:${auth.apiSecret}` };
    }
    // user-session / customer-session
    const token = await auth.credentials.getAccessToken();
    return {
      ...(auth.credentials.getRequestHeaders ? await auth.credentials.getRequestHeaders() : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(await authenticationHeaders())) headers.set(key, value);
    const response = await options.fetch(url, {
      ...init,
      headers,
      credentials: auth.mode === "session" ? "include" : init.credentials
    });

    if (response.status !== 401 || (auth.mode !== "user-session" && auth.mode !== "customer-session")) {
      return response;
    }

    // Session-based auth only: one refresh-and-retry attempt. Never falls back to
    // any other credential — if refresh fails, the original 401 is returned as-is
    // so the caller re-authenticates.
    const refreshed = await auth.credentials.refreshAccessToken();
    if (!refreshed) return response;
    headers.set("Authorization", `Bearer ${refreshed}`);
    return options.fetch(url, { ...init, headers });
  }

  function methodPath(method: string): string {
    return `/api/method/${method.split(".").map(encodeURIComponent).join(".")}`;
  }

  async function callMethod(method: string, init: RequestInit = {}): Promise<Response> {
    return request(methodPath(method), init);
  }

  async function getResource(doctype: string, name: string, init: RequestInit = {}): Promise<Response> {
    return request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, init);
  }

  async function listResources(doctype: string, options: ResourceListOptions, init: RequestInit = {}): Promise<Response> {
    const query = new URLSearchParams({
      fields: JSON.stringify(options.fields),
      limit_start: String(options.limitStart ?? 0),
      limit_page_length: String(options.limitPageLength ?? 500)
    });
    if (options.filters) query.set("filters", JSON.stringify(options.filters));
    return request(`/api/resource/${encodeURIComponent(doctype)}?${query.toString()}`, init);
  }

  return { request, callMethod, getResource, listResources };
}

export type ApiClient = ReturnType<typeof createApiClient>;
