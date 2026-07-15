import assert from "node:assert/strict";
import test from "node:test";
import { OAuthPkceCredentialProvider } from "../src/mobile/credential-provider";
import { MemorySecureStorage } from "../src/mobile/secure-storage";

const config=async()=>({baseUrl:"https://erp.example.com",clientId:"public-client",redirectUri:"com.beelbegins.aimaticpos://oauth/callback",scope:"pos-device",hardwareId:"device-1",deviceToken:"device-proof"});

test("OAuth refresh stores the rotated refresh token and coalesces concurrent refresh", async()=>{
  const storage=new MemorySecureStorage();
  await storage.set("pos.oauth.tokens.v1",JSON.stringify({accessToken:"old",refreshToken:"refresh-1",expiresAt:1,tokenType:"Bearer",scope:"pos-device"}));
  let calls=0;
  const provider=new OAuthPkceCredentialProvider(config,storage,{authorize:async()=>""},async(_url,init)=>{calls+=1;assert.match(String(init?.body),/refresh_token=refresh-1/);const headers=new Headers(init?.headers);assert.equal(headers.get("X-Aimatic-Device-ID"),"device-1");assert.equal(headers.get("X-Aimatic-Device-Token"),"device-proof");return new Response(JSON.stringify({access_token:"new",refresh_token:"refresh-2",expires_in:3600,token_type:"Bearer"}),{status:200,headers:{"Content-Type":"application/json"}});},()=>1000);
  assert.deepEqual(await Promise.all([provider.refreshAccessToken(),provider.refreshAccessToken()]),["new","new"]);
  assert.equal(calls,1);
  assert.match((await storage.get("pos.oauth.tokens.v1"))!,/refresh-2/);
});

test("rejected refresh clears credentials and never falls back",async()=>{
  const storage=new MemorySecureStorage();
  await storage.set("pos.oauth.tokens.v1",JSON.stringify({accessToken:"old",refreshToken:"stolen",expiresAt:1,tokenType:"Bearer",scope:"pos-device"}));
  const provider=new OAuthPkceCredentialProvider(config,storage,{authorize:async()=>""},async()=>new Response(JSON.stringify({error:"invalid_grant"}),{status:400,headers:{"Content-Type":"application/json"}}),()=>1000);
  assert.equal(await provider.refreshAccessToken(),null);
  assert.equal(await storage.get("pos.oauth.tokens.v1"),null);
});
