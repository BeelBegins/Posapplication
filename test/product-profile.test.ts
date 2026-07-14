import assert from "node:assert/strict";
import test from "node:test";
import { getProductProfile, listProductProfiles, requireBuildableProfile } from "../src/config/product-profile";

test("only Retail POS is enabled during Phase 1", () => {
  const enabled = listProductProfiles().filter((profile) => profile.enabled).map((profile) => profile.id);
  assert.deepEqual(enabled, ["pos"]);
  assert.equal(requireBuildableProfile("pos", "electron").name, "Ai Matic POS");
  assert.equal(requireBuildableProfile("pos", "capacitor").androidAppId, "com.beelbegins.aimaticpos");
});

test("future products cannot accidentally ship before their phase", () => {
  assert.throws(() => requireBuildableProfile("restaurant", "capacitor"), /later development phase/);
  assert.equal(getProductProfile("shopping").authentication, "customer-session");
});
