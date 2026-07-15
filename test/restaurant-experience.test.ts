import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { floors, menu, orders, tables } from "../src/products/restaurant/mock-data";
import { getProductProfile } from "../src/config/product-profile";

const app = readFileSync("src/products/restaurant/app.ts", "utf8");
const css = readFileSync("src/products/restaurant/styles.css", "utf8");
const workflow = readFileSync(".github/workflows/build-release.yml", "utf8");
const publisher = readFileSync("scripts/publish-github-release.cjs", "utf8");

test("Restaurant mock repository is realistic and isolated", () => {
  assert.equal(floors.length, 2);
  assert.ok(tables.length >= 15);
  assert.ok(orders.length >= 4);
  assert.ok(menu.length >= 10);
  assert.ok(tables.some((table) => table.status === "Needs attention"));
  assert.ok(tables.some((table) => table.status === "Bill requested"));
  assert.ok(menu.some((item) => !item.available));
  assert.doesNotMatch(app, /createRestaurantApi|api\/restaurant|electron|ipcRenderer/);
});

test("Restaurant build exposes only focused waiter navigation", () => {
  for (const label of ["Tables", "Orders", "Menu", "Activity", "Profile"]) assert.match(app, new RegExp(`\"${label}\"`));
  assert.doesNotMatch(app, /Shopping|Retail POS|Sales Ordering/);
  assert.deepEqual(getProductProfile("restaurant").platforms, ["capacitor"]);
  assert.match(workflow, /product: restaurant/);
  assert.match(workflow, /android-restaurant-release/);
  assert.match(publisher, /"Restaurant"/);
});

test("Restaurant UX includes operational, offline, and responsive states", () => {
  for (const state of ["Offline mode", "Pending synchronization", "Failed submission", "Duplicate prevented", "Session expired", "Item unavailable", "Price changed", "Table conflict", "Kitchen timeout"]) assert.match(app, new RegExp(state));
  assert.match(app, /data-action=\"send-kitchen\"/);
  assert.match(app, /data-action=\"request-bill\"/);
  assert.match(app, /data-qty-input/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media\(min-width:600px\)/);
  assert.match(css, /@media\(min-width:900px\)/);
  assert.match(css, /prefers-color-scheme:dark/);
  assert.match(css, /min-height:48px/);
});
