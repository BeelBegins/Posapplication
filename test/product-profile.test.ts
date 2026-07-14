import assert from "node:assert/strict";
import test from "node:test";
import { getProductProfile, listProductProfiles, requireBuildableProfile } from "../src/config/product-profile";

test("Retail POS and Phase 2 Restaurant are buildable", () => {
  const enabled = listProductProfiles().filter((profile) => profile.enabled).map((profile) => profile.id);
  assert.deepEqual(enabled, ["pos", "restaurant"]);
  assert.equal(requireBuildableProfile("pos", "electron").name, "Ai Matic POS");
  assert.equal(requireBuildableProfile("pos", "capacitor").androidAppId, "com.beelbegins.aimaticpos");
});

test("Phase 3 and 4 products cannot accidentally ship before their phase", () => {
  assert.equal(requireBuildableProfile("restaurant", "capacitor").authentication, "user-session");
  assert.throws(() => requireBuildableProfile("sales", "capacitor"), /later development phase/);
  assert.equal(getProductProfile("shopping").authentication, "customer-session");
});
