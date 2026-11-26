import test from "node:test";
import assert from "node:assert/strict";
import { createCatalogSyncCore } from "../../src/core/catalog-sync";
import { createHttpCore } from "../../src/core/http";
import type { PosCoreDeps } from "../../src/core/types";

function fakeDeps(fbrConfigs: Record<string, Record<string, unknown>>): PosCoreDeps {
  return {
    fetch: (() => { throw new Error("not expected to be called"); }) as unknown as typeof fetch,
    db: {
      getFbrItemConfigs: (codes: string[]) => Object.fromEntries(codes.filter((c) => c in fbrConfigs).map((c) => [c, fbrConfigs[c]])),
      getFbrSyncState: () => ({ itemCount: 1, serviceFee: 10, lastSynced: null, ready: true })
    } as unknown as PosCoreDeps["db"]
  };
}

test("calculateFbrCart reports a per-item error when no FBR config is cached", () => {
  const deps = fakeDeps({});
  const core = createCatalogSyncCore(deps, createHttpCore(deps));
  const result = core.calculateFbrCart({ items: [{ item_code: "ITEM-X", qty: 2, rate: 100 }] }) as { success: boolean; totals: unknown; errors: string[] };
  assert.equal(result.success, false);
  assert.equal(result.totals, null);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /FBR Tax Category is missing for ITEM-X/);
});

for (const [reason, config] of Object.entries({
  "missing MRP": { enabled: 1, tax_rate: 18, is_third_schedule: 1, custom_mrp: 0 },
  "disabled category": { enabled: 0, tax_rate: 18 },
  "unassigned category in synced config": { enabled: null, tax_rate: null },
})) {
  test(`calculateFbrCart rejects the whole cart for ${reason}, including mixed valid/invalid carts`, () => {
    const deps = fakeDeps({
      EYELINER: config,
      VALID: { enabled: 1, tax_rate: 18 },
    });
    const core = createCatalogSyncCore(deps, createHttpCore(deps));
    for (const items of [
      [{ item_code: "EYELINER", qty: 1, rate: 165 }],
      [{ item_code: "VALID", qty: 1, rate: 118 }, { item_code: "EYELINER", qty: 1, rate: 165 }],
    ]) {
      const result = core.calculateFbrCart({ items });
      assert.equal(result.success, false);
      assert.equal(result.totals, null);
      assert.equal((result.errors as string[]).length, 1);
    }
  });
}

test("corrected Third Schedule MRP restores all merchandise and service fee to payable", () => {
  const deps = fakeDeps({ EYELINER: { enabled: 1, tax_rate: 18, is_third_schedule: 1, custom_mrp: 165 } });
  const core = createCatalogSyncCore(deps, createHttpCore(deps));
  const result = core.calculateFbrCart({ items: [{ item_code: "EYELINER", qty: 1, rate: 165 }] });
  assert.equal(result.success, true);
  assert.deepEqual(result.errors, []);
  assert.equal((result.totals as { customerPayable: number }).customerPayable, 175);
});

test("calculateFbrCart computes standard-rate tax for a configured item and adds the service fee", () => {
  const deps = fakeDeps({
    "ITEM-A": { tax_rate: 18, is_exempt: false, is_zero_rated: false, is_third_schedule: false, enabled: 1 }
  });
  const core = createCatalogSyncCore(deps, createHttpCore(deps));
  const result = core.calculateFbrCart({ items: [{ item_code: "ITEM-A", qty: 1, rate: 118 }] }) as {
    errors: string[]; totals: { customerPayable: number };
  };
  assert.deepEqual(result.errors, []);
  assert.equal(result.totals.customerPayable, 128);
});

test("loadCustomer falls back to the synced customer list when ERP is unreachable", async () => {
  const synced = { name: "CUST-0042", customer_name: "Ali Traders", mobile_no: "+923001234567" };
  const deps: PosCoreDeps = {
    fetch: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch,
    db: {
      loadSettings: () => ({ erpnextUrl: "https://erp.example.com", apiKey: "k", apiSecret: "s" }),
      getCachedCustomer: () => null,
      searchCustomers: () => [{ name: "CUST-00421", customer_name: "Other" }, synced]
    } as unknown as PosCoreDeps["db"]
  };
  const core = createCatalogSyncCore(deps, createHttpCore(deps));
  const result = await core.loadCustomer("CUST-0042");
  assert.equal(result.cached, true);
  assert.deepEqual(result.customer, synced);
});
