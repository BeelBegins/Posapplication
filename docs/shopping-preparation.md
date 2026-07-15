# Ai Matic Shopping Phase 4

The Shopping product is an isolated Capacitor/web customer experience under `src/products/shopping`; Electron, Retail POS, Sales, and Restaurant do not import it.

Customer devices do not use POS Device enrollment or supervisor QR codes. Shopping uses a separate public OAuth2 PKCE client and ERPNext Website Users linked through `Customer.portal_users`. Account creation starts on ERPNext's standard signup surface; when enabled, the app then creates a new Customer for that signed-in Website User. It never links an existing Customer by matching email, mobile, or name. Tokens use Android encrypted storage or browser session storage and never fall back to employee or POS credentials.

## Customer flow

Home → categories/search → product detail → cart → customer sign-in → optional saved address → Store Pickup → Cash on Delivery → signed server quote → place order → order history/status.

The application calls only the implemented `aimatic.shopping.api` namespace. It does not call generic ERPNext resource endpoints and does not accept an API key or API secret.

## Server authority and privacy

- Catalogue responses must expose allow-listed storefront fields only: item code/name, description, public image, category, brand, display price, availability indicator, and public variants.
- Never return internal users, buying prices, valuation rates, warehouse documents, reports, cost centres, accounts, supplier data, or unrestricted DocType output.
- Resolve the authenticated website customer on the server. Never accept a Customer name from the client for account, address, pricing, or order-history calls.
- Filter every address and order query by that resolved customer.
- `quote_cart` must recalculate the price list, promotions, availability, taxes, and delivery charge in ERPNext. It returns a short-lived signed/opaque quote token.
- `place_order` accepts the quote token and an idempotent `request_id`; it revalidates the quote, stock policy, address ownership, delivery/payment methods, and ERPNext permissions before creating a Sales Order.
- Catalogue, quote, and checkout endpoints are rate limited. Quote tokens are short-lived and HMAC signed.
- The first release accepts only Cash on Delivery and Store Pickup, so no gateway or card secret exists.
- Order tracking returns customer-safe milestones, never internal comments or fulfillment documents.

## Local cart boundary

The device stores only a cart draft: branch, public item identity, selected variants, quantity, image URL, and last displayed rate. The displayed subtotal is explicitly an estimate. Checkout always requires a fresh matching, unexpired server quote.

The preparation does not yet include offline order submission. A customer may retain a local cart while offline, but placing an order requires the server.

The client persists one checkout request ID for the current cart until ERPNext confirms the result. A retry after a lost network response therefore returns the existing Sales Order instead of creating another one.

## Configuration and release checks

1. Enable and configure `Shopping Settings` with the public Branch, Price List, and pickup instructions.
2. Create explicit `Shopping Product` rows; no Item is public merely because it exists in ERPNext.
3. Either link an existing Website User manually under the correct Customer's Portal Users table, or enable self-registration with a leaf Customer Group and Territory. Self-registration creates new Customers only.
4. Run privacy, cross-customer authorization, rate-limit, duplicate-order, price-change, and stock-race checks.
5. Build Shopping, Sales, POS Android, and Electron separately. Restaurant remains deferred.

Address editing, home delivery, online gateways, and push notifications are intentionally outside the COD/store-pickup first release.

For browser deployment, configure one exact HTTPS `web_redirect_uri`, then run `npm run build:shopping:web` and deploy `dist-web/shopping` with SPA fallback for the callback path. The service worker caches only the application shell; API requests are never cached.
