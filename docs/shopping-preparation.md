# Ai Matic Shopping preparation

The Shopping product remains disabled in `product-profiles.json` until Phase 4 backend, authentication, payment, privacy, and end-to-end checks are complete. Its UI and domain foundation are intentionally isolated under `src/products/shopping`; Electron and Retail POS do not import it.

## Prepared customer flow

Home → categories/search → product catalogue → cart → customer sign-in → address → delivery method → payment method → server quote → place order → order history/status.

The shell is wired to the planned `aimatic.shopping.api` namespace. It does not call generic ERPNext resource endpoints and does not accept an API key or API secret.

## Server authority and public API requirements

- Catalogue responses must expose allow-listed storefront fields only: item code/name, description, public image, category, brand, display price, availability indicator, and public variants.
- Never return internal users, buying prices, valuation rates, warehouse documents, reports, cost centres, accounts, supplier data, or unrestricted DocType output.
- Resolve the authenticated website customer on the server. Never accept a Customer name from the client for account, address, pricing, or order-history calls.
- Filter every address and order query by that resolved customer.
- `quote_cart` must recalculate the price list, promotions, availability, taxes, and delivery charge in ERPNext. It returns a short-lived signed/opaque quote token.
- `place_order` accepts the quote token and an idempotent `request_id`; it revalidates the quote, stock policy, address ownership, delivery/payment methods, and ERPNext permissions before creating a Sales Order.
- Rate-limit login, catalogue search, quote, checkout, and tracking endpoints. Apply CSRF/session protections appropriate to the final customer authentication design.
- Payment secrets and gateway verification stay server-side. The client only receives a provider-safe checkout reference or redirect action.
- Order tracking returns customer-safe milestones, never internal comments or fulfillment documents.

## Local cart boundary

The device stores only a cart draft: branch, public item identity, selected variants, quantity, image URL, and last displayed rate. The displayed subtotal is explicitly an estimate. Checkout always requires a fresh matching, unexpired server quote.

The preparation does not yet include offline order submission. A customer may retain a local cart while offline, but placing an order requires the server.

## Activation gate

Before enabling the Shopping profile:

1. Implement and permission-test the allow-listed Frappe endpoints.
2. Configure a separate public Shopping OAuth client and connect it through `src/products/shopping/auth.ts`. It must never reuse the employee POS OAuth client or terminal credentials.
3. Add address creation/editing and delivery-area validation.
4. Integrate selected payment methods and webhook verification.
5. Add durable order-status refresh/push notifications.
6. Run privacy, authorization, rate-limit, duplicate-order, price-change, and stock-race tests.
7. Build and regression-test Shopping, Restaurant, POS Android, and Electron separately.
