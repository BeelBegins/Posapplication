import assert from "node:assert/strict";
import test from "node:test";
import { createShoppingAuthenticatedClient } from "../src/products/shopping/auth";

test("Shopping auth sends only a customer bearer session",async()=>{
  let authorization="";
  let deviceHeader="";
  const credentials={getAccessToken:async()=>"customer-access",refreshAccessToken:async()=>null,login:async()=>"customer-access",clear:async()=>undefined};
  const auth=createShoppingAuthenticatedClient({baseUrl:"https://shop.example.com",credentials,fetch:async(_url,init)=>{const headers=new Headers(init?.headers);authorization=headers.get("Authorization")||"";deviceHeader=headers.get("X-Aimatic-Device-ID")||"";return new Response("{}",{status:200});}});
  await auth.client.request("/api/method/aimatic.shopping.api.get_account");
  assert.equal(authorization,"Bearer customer-access");
  assert.equal(authorization.includes("token "),false);
  assert.equal(deviceHeader,"");
});
