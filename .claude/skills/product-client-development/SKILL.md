---
name: product-client-development
description: Use for Sales, Shopping, Restaurant, shared mobile APIs/UI/auth, Capacitor plugins, product profiles, Android navigation, OAuth PKCE, secure storage, product-specific offline behavior, or any change that might cross product boundaries.
---

# Product client development

Start with `docs/product-architecture.md` and `docs/build-profiles.md`, then load
only the affected product doc.

## Boundaries

- Sales calls only `aimatic.mobile_sales.api`; server owns pricing, discounts,
  stock, permissions, delivery rules, promotion application and final orders.
- Shopping accepts only customer sessions, calls only `aimatic.shopping.api`,
  exposes enabled Shopping Products, and never exposes costs/admin data.
- Restaurant calls only `aimatic.restaurant.api`; demo data never submits.
- POS, Sales, Shopping and Restaurant keep separate auth clients, package IDs,
  callback URLs, routes, navigation, plugins and release artifacts.
- Shared UI helpers contain presentation only, not product state/API behavior.
- Keep product-specific native plugins out of unrelated Capacitor builds.
- OAuth clients are public PKCE clients with no client secret; tokens/proofs use
  native secure storage where applicable.

Validate the affected product build plus shared TypeScript tests. Check offline,
queued, failed, re-authentication and deep-link behavior on a real device before
release when the change touches those paths.
