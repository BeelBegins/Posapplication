import type { CredentialProvider } from "../api/client";
import type { SecureStorage } from "./secure-storage";
import { buildAuthorizationUrl, createPkceRequest, parseAuthorizationCallback, tokenSetFromResponse, type OAuthTokenSet } from "./oauth-pkce";

export interface OAuthPublicClientConfig {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  hardwareId?: string;
  deviceToken?: string;
}

export interface OAuthAuthorizationBrowser {
  authorize(url: string, redirectUri: string): Promise<string>;
}

const tokenKey = "pos.oauth.tokens.v1";
const pendingKey = "pos.oauth.pending.v1";

export class OAuthPkceCredentialProvider implements CredentialProvider {
  private refreshPromise: Promise<string | null> | null = null;

  constructor(
    private readonly config: () => Promise<OAuthPublicClientConfig>,
    private readonly storage: SecureStorage,
    private readonly browser: OAuthAuthorizationBrowser,
    private readonly fetchImpl: typeof fetch,
    private readonly now: () => number = Date.now
  ) {}

  private async tokens(): Promise<OAuthTokenSet | null> {
    const raw = await this.storage.get(tokenKey);
    if (!raw) return null;
    try { return JSON.parse(raw) as OAuthTokenSet; }
    catch { await this.storage.remove(tokenKey); return null; }
  }

  private async save(tokens: OAuthTokenSet): Promise<void> {
    await this.storage.set(tokenKey, JSON.stringify(tokens));
  }

  async getRequestHeaders(): Promise<Record<string, string>> {
    const config = await this.config();
    if (!config.hardwareId || !config.deviceToken) return {};
    return {
      "X-Aimatic-Device-ID": config.hardwareId,
      "X-Aimatic-Device-Token": config.deviceToken
    };
  }

  async getAccessToken(): Promise<string | null> {
    const tokens = await this.tokens();
    if (!tokens) return null;
    if (tokens.expiresAt > this.now() + 30_000) return tokens.accessToken;
    return this.refreshAccessToken();
  }

  async login(): Promise<string> {
    const config = await this.config();
    if (!config.baseUrl || !config.clientId) throw new Error("This device is not enrolled for OAuth login.");
    const request = await createPkceRequest(globalThis.crypto, this.now());
    await this.storage.set(pendingKey, JSON.stringify(request.pending));
    try {
      const authorizationUrl = buildAuthorizationUrl({ ...config, state: request.pending.state, challenge: request.challenge });
      const callbackUrl = await this.browser.authorize(authorizationUrl, config.redirectUri);
      const code = parseAuthorizationCallback(callbackUrl, config.redirectUri, request.pending.state);
      const response = await this.fetchImpl(new URL("/api/method/frappe.integrations.oauth2.get_token", config.baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...await this.getRequestHeaders() },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri, client_id: config.clientId, code_verifier: request.pending.verifier })
      });
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof body.error_description === "string" ? body.error_description : "OAuth token exchange failed.");
      const tokens = tokenSetFromResponse(body, this.now());
      await this.save(tokens);
      return tokens.accessToken;
    } finally {
      await this.storage.remove(pendingKey);
    }
  }

  async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refresh().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  private async refresh(): Promise<string | null> {
    const existing = await this.tokens();
    if (!existing?.refreshToken) return null;
    const config = await this.config();
    try {
      const response = await this.fetchImpl(new URL("/api/method/frappe.integrations.oauth2.get_token", config.baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...await this.getRequestHeaders() },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: existing.refreshToken, client_id: config.clientId })
      });
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) { await this.clear(); return null; }
      const rotated = tokenSetFromResponse(body, this.now());
      await this.save(rotated);
      return rotated.accessToken;
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    await this.storage.remove(tokenKey);
    await this.storage.remove(pendingKey);
  }
}
