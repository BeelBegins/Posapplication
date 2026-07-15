# Ai Matic Shopping Phase 4

The Shopping product is an isolated Capacitor/web customer experience under `src/products/shopping`; Electron, Retail POS, Sales, and Restaurant do not import it.

Customer devices do not use POS Device enrollment or supervisor QR codes. Shopping uses a separate public OAuth2 PKCE client and ERPNext Website Users linked through `Customer.portal_users`. Account creation starts on ERPNext's standard signup surface; when enabled, the app then creates a new Customer for that signed-in Website User. It never links an existing Customer by matching email, mobile, or name. Tokens use Android encrypted storage or browser session storage and never fall back to employee or POS credentials.

## Customer flow

Home → categories/search → product detail → cart → customer sign-in → address → delivery or Store Pickup → Cash on Delivery → review with a signed server quote → place order → order history/status.

The customer-facing navigation is Home → Categories → Cart → Orders → Account. Home prioritizes search, location, compact categories, popular products, new arrivals, and the saved cart. Catalogue cards show public image, price/MRP, availability, and in-card quantity controls. Product detail adds savings, brand/category, description, fulfillment availability, Buy Now, and related items without exposing internal ERPNext fields.

Signed-out customers see explicit **Customer login** and **Create account** actions on Home and Account. Account also shows the connected store URL and a guarded **Change store or server** action. Changing sites signs out and clears that site's local cart so customer/cart data cannot leak between ERPNext installations.

The cart keeps typed and +/- quantity controls, unit price, savings, line total, availability, price-change warnings, and remove actions visible beside a sticky summary. Every cart mutation advances a monotonic revision even when taps occur in the same millisecond, so stale quotes and checkout attempts cannot survive a rapid edit. Checkout is presented as five clear steps: Address, Delivery or Pickup, Payment, Review, and Place Order. Address, fulfillment, payment, and instructions survive quote/loading re-renders; changing fulfillment invalidates the quote visibly. The existing stable checkout request ID remains the duplicate-submission guard. Order history uses customer-friendly labels and a milestone timeline rather than raw internal documents.

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
5. Build Shopping, Sales, POS Android, and Electron separately. `capacitor.config.js` excludes the barcode scanner and its native ML models from Shopping because Shopping has no scanner workflow. Restaurant remains deferred.

Dedicated in-app address editing, save-for-later persistence, reorder submission, online gateways, and push notifications remain backend limitations. The UX explains these unavailable actions instead of pretending they succeeded. Delivery instructions are displayed in checkout but require an explicit server contract before they can be persisted.

For browser deployment, configure one exact HTTPS `web_redirect_uri`, then run `npm run build:shopping:web` and deploy `dist-web/shopping` with SPA fallback for the callback path. The service worker caches only the application shell; API requests are never cached.

The Siezal storefront is deployed at `https://shop.aimatic.tech/`. Caddy serves the PWA and proxies only the required Frappe API/login/assets/files paths to `siezal.aimatic.tech`; `/desk` and `/app` remain Shopping client routes. The protected `/uploadimageproduct` route is the System Manager product-image studio. It uploads against an enabled `Shopping Product`, queues local U²-Net background removal in an isolated Python 3.12 environment, retains the original, and changes `Shopping Product.image` only after preview approval. The processor has no paid API and never runs inside the Frappe Python environment.
