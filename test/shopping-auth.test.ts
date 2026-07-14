import assert from "node:assert/strict";
import test from "node:test";
import { createShoppingAuthenticatedClient } from "../src/products/shopping/auth";

test("Shopping auth sends only a customer bearer session",async()=>{
  let authorization="";
  const credentials={getAccessToken:async()=>"customer-access",refreshAccessToken:async()=>null,login:async()=>"customer-access",clear:async()=>undefined};
  const auth=createShoppingAuthenticatedClient({baseUrl:"https://shop.example.com",credentials,fetch:async(_url,init)=>{authorization=new Headers(init?.headers).get("Authorization")||"";return new Response("{}",{status:200});}});
  await auth.client.request("/api/method/aimatic.shopping.api.get_account");
  assert.equal(authorization,"Bearer customer-access");
  assert.equal(authorization.includes("token "),false);
});
