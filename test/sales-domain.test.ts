import test from "node:test"; import assert from "node:assert/strict";
import { assertSalesDraftReady, markDraft, newSalesDraft, setDraftItem } from "../src/products/sales/domain";

test("sales drafts keep one quantity per item and remove zero quantities",()=>{let d=newSalesDraft("Main",new Date("2026-07-15T00:00:00Z"));d={...d,customer:"CUST-1"};d=setDraftItem(d,{item_code:"ITEM-1",qty:2,uom:"Nos"});d=setDraftItem(d,{item_code:"ITEM-1",qty:4,uom:"Nos"});assert.equal(d.items.length,1);assert.equal(d.items[0].qty,4);d=setDraftItem(d,{item_code:"ITEM-1",qty:0});assert.equal(d.items.length,0)});
test("ready sales draft requires branch customer delivery and items",()=>{const d={...newSalesDraft("Main"),customer:"CUST-1",items:[{item_code:"ITEM-1",qty:1}]};assert.doesNotThrow(()=>assertSalesDraftReady(d));assert.throws(()=>assertSalesDraftReady({...d,customer:""}),/Branch and customer/)});
test("queued draft preserves its idempotency request id",()=>{const d=newSalesDraft("Main");const queued=markDraft(d,"queued",{error:"offline"});assert.equal(queued.requestId,d.requestId);assert.equal(queued.status,"queued")});
