# Ai Matic API Contracts

`src/api/client.ts` is the common ERPNext transport. Authentication is explicit and product-scoped:

- `terminal-token`: Electron terminal API key/secret.
- `user-session`: Android employee OAuth Bearer session, with one refresh-and-retry on a 401.
- `customer-session`: Shopping customer OAuth Bearer session, with the same bounded refresh behavior.
- `session`: cookie-based requests where an approved server flow requires them.

Session modes never fall back to terminal credentials. Raw authorization headers must not be assembled in domain modules; they belong in this transport and its credential provider.

Current domain facades are:

- `authentication`
- `branches`
- `items`
- `stock`
- `pricing`
- `customers`
- `pos`
- `restaurant`
- `shopping`

The implemented POS facades wrap existing Frappe Resource APIs and `aimatic.offline_pos.api` methods. They do not reproduce ERPNext pricing, stock, tax, permission, or submission rules.

The Restaurant facade targets the Phase 2 contract documented in [restaurant-phase2.md](restaurant-phase2.md). The Shopping facade and customer-safe auth adapter are prepared against the planned `aimatic.shopping.api` namespace, but Shopping remains build-disabled until that restricted backend exists and passes its security gates. Sales Orders and Delivery APIs will be added only in their implementation phases. A client facade or placeholder endpoint is not evidence that a server contract is operational.
