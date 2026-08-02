import test from "node:test";
import assert from "node:assert/strict";
import { createPosConfigCore } from "../../src/core/pos-config";
import { createHttpCore } from "../../src/core/http";
import type { PosCoreDeps } from "../../src/core/types";

function fakeDeps(): PosCoreDeps {
  return {
    fetch: (() => { throw new Error("not expected to be called"); }) as unknown as typeof fetch,
    db: {} as PosCoreDeps["db"]
  };
}

test("summarizePosConfiguration returns null when there is no pos_profile in the cached bundle", () => {
  const deps = fakeDeps();
  const core = createPosConfigCore(deps, createHttpCore(deps));
  assert.equal(core.summarizePosConfiguration({}), null);
});

test("summarizePosConfiguration returns null when the bundle has never been synced", () => {
  const deps = fakeDeps();
  const core = createPosConfigCore(deps, createHttpCore(deps));
  assert.equal(core.summarizePosConfiguration({ pos_profile: { name: "Main" } }), null);
});

test("summarizePosConfiguration maps a synced configuration bundle", () => {
  const deps = fakeDeps();
  const core = createPosConfigCore(deps, createHttpCore(deps));
  const summary = core.summarizePosConfiguration({
    pos_profile: { name: "Main", company: "Test Co", branch: "Branch A", warehouse: "WH-A", customer: "Walk-in", selling_price_list: "Standard", currency: "PKR" },
    tax_template: { name: "Std Tax", taxes: [{ rate: 18 }] },
    payment_modes: [{ name: "Cash" }, { name: "Card" }],
    synced_at: "2026-01-01T00:00:00.000Z"
  });
  assert.deepEqual(summary, {
    posProfile: "Main", company: "Test Co", branch: "Branch A", warehouse: "WH-A", defaultCustomer: "Walk-in",
    sellingPriceList: "Standard", currency: "PKR", taxTemplate: "Std Tax", taxRowsCount: 1, paymentMethodsCount: 2,
    lastSynced: "2026-01-01T00:00:00.000Z", cacheStatus: "Ready"
  });
});

test("previewCart sends the human cashier identity to the server", async () => {
  const sentBodies: Record<string, unknown>[] = [];
  const deps: PosCoreDeps = {
    fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
      sentBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(JSON.stringify({ message: { totals: {} } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch,
    db: {
      loadSettings: () => ({
        erpnextUrl: "https://szl.example.com",
        apiKey: "terminal-key",
        apiSecret: "terminal-secret",
        posProfile: "S1GT Counter 1"
      })
    } as PosCoreDeps["db"]
  };
  const core = createPosConfigCore(deps, createHttpCore(deps));

  const result = await core.previewCart({
    customer: "Walk In Customer",
    items: [{ item_code: "ITEM-1", qty: 1 }],
    cashier_user: "smir@aimatic.tech"
  });

  assert.equal(result.error, null);
  assert.equal(sentBodies[0]?.cashier_user, "smir@aimatic.tech");
  assert.equal(sentBodies[0]?.pos_profile, "S1GT Counter 1");
});
