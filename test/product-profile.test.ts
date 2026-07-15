import assert from "node:assert/strict";
import test from "node:test";
import { getProductProfile, listProductProfiles, requireBuildableProfile } from "../src/config/product-profile";

test("POS, Restaurant, Sales, and Shopping profiles are independently buildable", () => {
  const enabled = listProductProfiles().filter((profile) => profile.enabled).map((profile) => profile.id);
  assert.deepEqual(enabled, ["pos", "restaurant", "sales", "shopping"]);
  assert.equal(requireBuildableProfile("pos", "electron").name, "Ai Matic POS");
  assert.equal(requireBuildableProfile("pos", "capacitor").androidAppId, "com.beelbegins.aimaticpos");
  assert.equal(requireBuildableProfile("pos", "capacitor").androidOrientation, "sensorPortrait");
});

test("Sales and Shopping remain isolated from Electron", () => {
  assert.equal(requireBuildableProfile("restaurant", "capacitor").authentication, "user-session");
  assert.equal(requireBuildableProfile("sales", "capacitor").authentication, "user-session");
  assert.throws(() => requireBuildableProfile("sales", "electron"), /does not support electron/);
  assert.equal(requireBuildableProfile("shopping", "capacitor").authentication, "customer-session");
  assert.equal(requireBuildableProfile("sales", "capacitor").androidOrientation, "sensorPortrait");
  assert.equal(requireBuildableProfile("shopping", "capacitor").androidOrientation, "sensorPortrait");
  assert.throws(() => requireBuildableProfile("shopping", "electron"), /does not support electron/);
  assert.equal(getProductProfile("shopping").authentication, "customer-session");
});
