# Ai Matic Product Architecture

## Scope

Ai Matic is one repository with four focused products:

- Ai Matic POS: Retail POS for Electron and Capacitor.
- Ai Matic Restaurant: waiter ordering for Capacitor; Phase 2.
- Ai Matic Sales: salesperson ordering for Capacitor; Phase 3.
- Ai Matic Shopping: customer shopping for Capacitor/web; Phase 4.

Phase 2 Restaurant contracts and status invariants are documented in [restaurant-phase2.md](restaurant-phase2.md).

Retail POS remains the only Electron product. Restaurant is independently buildable during Phase 2; Sales and Shopping remain build-disabled. A disabled product profile fails the build instead of silently packaging placeholder or unrelated screens.

## Shared and product-specific code

Shared code may contain ERPNext transport, authentication contracts, branches, items, stock, pricing, customers, cart primitives, offline persistence contracts, synchronization primitives, and design-system code.

Product workflows and screens stay in separate entry points. Retail POS remains in `src/renderer` until a behavior-preserving extraction is justified. Restaurant, Sales, and Shopping must not be added to the Retail POS renderer and hidden with CSS or roles.

ERPNext remains authoritative for permissions, prices, stock, taxes, credit limits, order/invoice submission, and accounting effects.

## Platform boundary

`src/platform/platform-service.ts` is the central capability map. Electron and Capacitor create it explicitly; shared business code does not infer a platform by importing Electron or Capacitor.

Electron owns desktop printing, IPC, filesystem/update operations, customer display, and window keyboard controls. Capacitor owns Android printing/storage today and will own camera permissions, scanner plugins, and push notifications when those features are implemented.

## Storage

The existing `IDatabaseService` contract and both implementations remain in place:

- Electron: `better-sqlite3`.
- Android: the existing application-storage JSON adapter.

Each future product has a separate storage namespace in `src/config/product-profiles.json`. Existing POS data is not migrated or renamed in Phase 1.
