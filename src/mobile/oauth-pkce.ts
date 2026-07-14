export interface OAuthTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: "Bearer";
  scope: string;
}

export interface OAuthPendingRequest {
  state: string;
  verifier: string;
  createdAt: number;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomUrlSafe(bytes = 32, cryptoImpl: Crypto = globalThis.crypto): string {
  const value = new Uint8Array(bytes);
  cryptoImpl.getRandomValues(value);
  return base64Url(value);
}

export async function createPkceRequest(cryptoImpl: Crypto = globalThis.crypto, now = Date.now()): Promise<{ pending: OAuthPendingRequest; challenge: string }> {
  const verifier = randomUrlSafe(64, cryptoImpl);
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { pending: { state: randomUrlSafe(32, cryptoImpl), verifier, createdAt: now }, challenge: base64Url(new Uint8Array(digest)) };
}

export function buildAuthorizationUrl(input: { baseUrl: string; clientId: string; redirectUri: string; scope: string; state: string; challenge: string }): string {
  const url = new URL("/api/method/frappe.integrations.oauth2.authorize", input.baseUrl);
  url.search = new URLSearchParams({
    client_id: input.clientId,
    response_type: "code",
    redirect_uri: input.redirectUri,
    scope: input.scope,
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256"
  }).toString();
  return url.toString();
}

export function parseAuthorizationCallback(callbackUrl: string, redirectUri: string, expectedState: string): string {
  const callback = new URL(callbackUrl);
  const expected = new URL(redirectUri);
  if (callback.protocol !== expected.protocol || callback.host !== expected.host || callback.pathname !== expected.pathname) throw new Error("OAuth redirect URI does not match this application.");
  if (callback.searchParams.get("state") !== expectedState) throw new Error("OAuth state validation failed.");
  const error = callback.searchParams.get("error");
  if (error) throw new Error(callback.searchParams.get("error_description") || `OAuth authorization failed: ${error}`);
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("OAuth authorization code is missing.");
  return code;
}

export function tokenSetFromResponse(value: Record<string, unknown>, now = Date.now()): OAuthTokenSet {
  const accessToken = typeof value.access_token === "string" ? value.access_token : "";
  const refreshToken = typeof value.refresh_token === "string" ? value.refresh_token : "";
  const expiresIn = Number(value.expires_in);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error("OAuth token response is incomplete.");
  if (value.token_type && String(value.token_type).toLowerCase() !== "bearer") throw new Error("OAuth server returned an unsupported token type.");
  return { accessToken, refreshToken, expiresAt: now + expiresIn * 1000, tokenType: "Bearer", scope: typeof value.scope === "string" ? value.scope : "" };
}
