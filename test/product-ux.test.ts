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
  const api = source("src/api/sales-orders.ts");
  // Drafts and Orders were merged into one "My Orders" screen (with status filter
  // chips) so a rep only has one place to look for the pipeline of an order,
  // instead of guessing which of two separate screens it's on.
  for (const label of ["Customers", "Order", "My Orders", "Profile"]) assert.match(app, new RegExp(`label:"${label}"`));
  for (const state of ["queued", "failed", "submitted"]) assert.match(app, new RegExp(`"${state}"`));
  assert.match(app, /Retry safely|Retry</);
  assert.match(app, /original request ID and failure state remain/);
  // Cards retain pre-add UOM selection, while the explicit Fast Order mode adds
  // dense in-row quantity/UOM controls without reviving the old card-grid editor.
  assert.match(app, /data-open-cart/);
  assert.match(app, /data-line-uom/);
  assert.match(app, /data-product-uom/);
  assert.match(app, /data-catalog-view/);
  assert.match(app, /fastOrderRow/);
  assert.match(app, /data-fast-uom/);
  assert.match(app, /data-fast-qty-step/);
  assert.match(app, /data-fast-qty-input/);
  assert.match(app, /catalogViewKey/);
  assert.match(app, /syncBar/);
  assert.match(app, /data-sync-bar/);
  assert.match(app, /lastSyncKey/);
  // Phase 1 acceleration stays permission- and ERP-authoritative: recent orders
  // seed a fresh local draft, then every line/UOM is refreshed before review.
  assert.match(api, /getRecentReorderCandidates/);
  assert.match(api, /getCustomerLastOrder/);
  assert.match(api, /getCustomerItemHistory/);
  assert.match(api, /getCustomerAssortment/);
  assert.match(api, /getCustomerDeliveryLocations/);
  assert.match(api, /validateDiscount/);
  assert.match(api, /requestDiscountApproval/);
  assert.match(api, /getDiscountApprovals/);
  assert.match(api, /approveDiscount/);
  assert.match(api, /assortment_only/);
  assert.match(app, /startReorder/);
  assert.match(app, /newSalesDraft/);
  assert.match(app, /Refreshing .* with current ERPNext data/);
  assert.match(app, /data-reorder-order/);
  assert.match(app, /reorderCacheKey/);
  assert.match(app, /customerSearchHistoryKey/);
  assert.match(app, /itemSearchHistoryKey/);
  assert.match(app, /data-run-search/);
  assert.match(app, /data-remove-search/);
  assert.match(app, /data-clear-search/);
  assert.match(app, /voiceSearchAvailable/);
  assert.match(app, /data-confirmation-share/);
  assert.match(app, /data-confirmation-copy/);
  assert.match(app, /Draft · awaiting ERPNext submission/);
  assert.match(app, /customer_history/);
  assert.match(app, /data-apply-history/);
  assert.match(app, /Last submitted quantity applied/);
  assert.match(app, /assortmentCacheKey/);
  assert.match(app, /data-assortment-filter/);
  assert.match(app, /configured products/);
  assert.match(app, /deliveryCacheKey/);
  assert.match(app, /data.*delivery|delivery-location/);
  assert.match(app, /delivery_location/);
  assert.match(app, /assertDeliveryReady/);
  assert.match(app, /minimum_order_value/);
  assert.match(app, /Available delivery days|delivery-days/);
  assert.match(app, /discount_authority_percent/);
  assert.match(app, /discount_percent/);
  assert.match(app, /assertDiscountReady/);
  assert.match(app, /data-approve-discount/);
  assert.match(app, /data-reject-discount/);
  assert.match(app, /Discount approval pending/);
  assert.match(styles, /\.fast-order-row/);
  assert.match(styles, /\.sync-bar/);
  assert.match(styles, /\.reorder-card/);
  assert.match(styles, /\.recent-search-row/);
  assert.match(styles, /\.order-confirmation/);
  assert.match(styles, /\.fast-history/);
  assert.match(styles, /\.assortment-filter/);
  assert.match(styles, /\.delivery-panel/);
  assert.match(styles, /\.delivery-panel select \{ min-height: 48px/);
  assert.match(styles, /\.delivery-minimum-warning/);
  assert.match(styles, /\.discount-panel/);
  assert.match(styles, /\.manager-approval-panel/);
  assert.match(styles, /\.approval-card button \{ min-height: 48px/);
  assert.match(styles, /\.confirmation-actions button \{ min-height: 48px/);
  assert.match(styles, /\.fast-quantity button \{ width: 48px; min-height: 48px/);
  assert.match(app, /factor<=0/);
  assert.match(app, /Search item, code, category or brand/);
  assert.match(app, /data-brand/);
  assert.match(app, /item_group.*brand/);
  assert.doesNotMatch(app, /data-card-qty/);
  assert.match(app, /ERPNext default/);
  assert.match(app, /id="customer-warehouse"/);
  assert.match(app, /Select a warehouse before choosing a customer/);
  assert.match(app, /Change ERPNext server/);
  assert.match(styles, /grid-template-columns:\s*repeat\(4,\s*1fr\)/);
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
