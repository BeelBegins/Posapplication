import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { bottomNavigation, emptyState } from "../src/products/shared/ui";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

test("shared bottom navigation exposes only the requested focused product routes", () => {
  const html = bottomNavigation("Sales navigation", "order", [
    { id: "customers", label: "Customers", icon: "C" },
    { id: "order", label: "Order", icon: "O", badge: 2 },
    { id: "drafts", label: "Drafts", icon: "D" },
    { id: "orders", label: "Orders", icon: "H" },
    { id: "profile", label: "Profile", icon: "P" },
  ]);
  assert.match(html, /aria-label="Sales navigation"/);
  assert.match(html, /data-screen="order" aria-current="page"/);
  assert.match(html, />Customers</);
  assert.doesNotMatch(html, /Restaurant|Shopping|Retail POS/);
});

test("shared empty state has an accessible action and escapes server text", () => {
  const html = emptyState("!", "No <items>", "Try & retry", { label: "Retry", attribute: 'data-retry="true"' });
  assert.match(html, /No &lt;items&gt;/);
  assert.match(html, /Try &amp; retry/);
  assert.match(html, /data-retry="true">Retry/);
});

test("POS desktop routes and cashier shortcuts remain intact", () => {
  const html = source("src/renderer/index.html");
  const renderer = source("src/renderer/renderer.ts");
  for (const id of ["pos-screen", "cart-search", "payment-dialog", "payment-complete", "complete-sale"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const shortcut of ["F6", "F7", "F9"]) assert.match(renderer, new RegExp(shortcut));
});

test("Android POS touch layout and scanner remain isolated from Electron", () => {
  const styles = source("src/renderer/styles.css");
  const mobile = source("src/mobile/mobile.ts");
  const renderer = source("src/renderer/renderer.ts");
  assert.match(styles, /\.android-app \.mobile-pos-tabs/);
  assert.match(styles, /\.android-app \.mobile-cart-dock/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(mobile, /scanItemBarcode/);
  assert.doesNotMatch(renderer, /@capacitor\//);
});

test("Sales navigation, offline statuses, and safe retry are visible", () => {
  const app = source("src/products/sales/app.ts");
  const styles = source("src/products/sales/styles.css");
  for (const label of ["Customers", "Order", "Drafts", "Orders", "Profile"]) assert.match(app, new RegExp(`label:"${label}"`));
  for (const state of ["queued", "failed", "submitted"]) assert.match(app, new RegExp(`"${state}"`));
  assert.match(app, /Retry safely/);
  assert.match(app, /original request ID and failure state remain/);
  assert.match(app, /data-card-qty/);
  assert.match(app, /ERPNext default/);
  assert.match(app, /id="customer-warehouse"/);
  assert.match(app, /Select a warehouse before choosing a customer/);
  assert.match(app, /Change ERPNext server/);
  assert.match(styles, /grid-template-columns:\s*repeat\(5,\s*1fr\)/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.doesNotMatch(app, /Restaurant navigation|Shopping navigation|POS navigation/);
});

test("Shopping navigation and customer-safe checkout flow stay focused", () => {
  const app = source("src/products/shopping/app.ts");
  const styles = source("src/products/shopping/styles.css");
  for (const label of ["Home", "Categories", "Cart", "Orders", "Account"]) assert.match(app, new RegExp(`label:"${label}"`));
  for (const step of ["Address", "Delivery or pickup", "Payment", "Review", "Place order"]) assert.match(app, new RegExp(step, "i"));
  assert.match(app, /stable request ID prevents duplicate submission/i);
  assert.match(app, /Customer login/);
  assert.match(app, /Create new account/);
  assert.match(app, /Change store or server/);
  assert.match(styles, /\.cart-layout,\s*\.checkout-layout/);
  assert.match(styles, /\.sticky-summary\s*\{\s*position:\s*sticky/);
  assert.match(styles, /grid-template-columns:\s*repeat\(5,\s*1fr\)/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.doesNotMatch(app, /Restaurant navigation|Sales navigation|POS navigation/);
});

test("Capacitor barcode models ship only in products with live scan workflows", () => {
  const config = source("capacitor.config.js");
  assert.match(config, /productId === "pos" \|\| productId === "sales"/);
  assert.match(config, /includePlugins\.push\("@capacitor\/barcode-scanner"\)/);
  assert.doesNotMatch(config, /productId === "restaurant"[^\n]*barcode-scanner/);
  assert.doesNotMatch(config, /productId === "shopping"[^\n]*barcode-scanner/);
});

test("mobile responsive rules retain large targets and reduced-motion support", () => {
  for (const file of ["src/products/sales/styles.css", "src/products/shopping/styles.css"]) {
    const styles = source(file);
    assert.match(styles, /@media\s*\(max-width:\s*760px\)/);
    assert.match(styles, /@media\s*\(max-width:\s*420px\)/);
    assert.match(styles, /prefers-reduced-motion:\s*reduce/);
    assert.match(styles, /min-height:\s*48px/);
  }
});
