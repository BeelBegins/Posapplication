export type ApiAuthentication =
  | { mode: "terminal-token"; apiKey: string; apiSecret: string }
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

  function authenticationHeaders(): Record<string, string> {
    if (options.authentication.mode === "session") return {};
    const { apiKey, apiSecret } = options.authentication;
    if (!apiKey || !apiSecret) throw new Error("Terminal API credentials are required.");
    return { Authorization: `token ${apiKey}:${apiSecret}` };
  }

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(authenticationHeaders())) headers.set(key, value);
    return options.fetch(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      headers,
      credentials: options.authentication.mode === "session" ? "include" : init.credentials
    });
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
