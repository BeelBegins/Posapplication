# Shopping product

Accept only the customer OAuth session and call only `aimatic.shopping.api`.
Never expose costs, purchasing, accounts, terminal credentials or generic
Resource API access. Preserve signed quotes, idempotent COD/Store Pickup
orders, monotonic cart revisions and strict customer linking. Keep Shopping
scanner-free and isolated from other product plugins/routes.
