import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthorizationUrl, parseAuthorizationCallback, tokenSetFromResponse } from "../src/mobile/oauth-pkce";

test("PKCE authorization URL carries public-client parameters and no secret", () => {
  const url = new URL(buildAuthorizationUrl({ baseUrl:"https://erp.example.com",clientId:"public-id",redirectUri:"com.beelbegins.aimaticpos://oauth/callback",scope:"pos-device",state:"state-1",challenge:"challenge-1" }));
  assert.equal(url.searchParams.get("client_id"), "public-id");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("client_secret"), null);
});

test("OAuth callback rejects wrong state and wrong redirect URI", () => {
  const redirect = "com.beelbegins.aimaticpos://oauth/callback";
  assert.equal(parseAuthorizationCallback(`${redirect}?code=abc&state=expected`,redirect,"expected"),"abc");
  assert.throws(()=>parseAuthorizationCallback(`${redirect}?code=abc&state=attacker`,redirect,"expected"),/state/i);
  assert.throws(()=>parseAuthorizationCallback("https://attacker.example/callback?code=abc&state=expected",redirect,"expected"),/redirect URI/i);
});

test("token response requires rotating-capable access and refresh tokens", () => {
  const tokens=tokenSetFromResponse({access_token:"access",refresh_token:"refresh",expires_in:3600,token_type:"Bearer",scope:"pos-device"},1000);
  assert.equal(tokens.expiresAt,3601000);
  assert.throws(()=>tokenSetFromResponse({access_token:"access",expires_in:3600},1000),/incomplete/i);
});
