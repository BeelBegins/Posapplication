import assert from "node:assert/strict";
import test from "node:test";
import { getProductProfile, listProductProfiles, requireBuildableProfile } from "../src/config/product-profile";

test("Retail POS, deferred Restaurant, and completed Sales profiles are buildable", () => {
  const enabled = listProductProfiles().filter((profile) => profile.enabled).map((profile) => profile.id);
  assert.deepEqual(enabled, ["pos", "restaurant", "sales"]);
  assert.equal(requireBuildableProfile("pos", "electron").name, "Ai Matic POS");
  assert.equal(requireBuildableProfile("pos", "capacitor").androidAppId, "com.beelbegins.aimaticpos");
});

test("Sales is isolated to Capacitor while Shopping remains disabled", () => {
  assert.equal(requireBuildableProfile("restaurant", "capacitor").authentication, "user-session");
  assert.equal(requireBuildableProfile("sales", "capacitor").authentication, "user-session");
  assert.throws(() => requireBuildableProfile("sales", "electron"), /does not support electron/);
  assert.throws(() => requireBuildableProfile("shopping", "capacitor"), /later development phase/);
  assert.equal(getProductProfile("shopping").authentication, "customer-session");
});
