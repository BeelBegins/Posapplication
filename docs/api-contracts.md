# Ai Matic API Contracts

`src/api/client.ts` is the common ERPNext transport. It supports the existing terminal-token mode and a session mode that sends cookies without creating an Authorization token header.

Current domain facades are:

- `authentication`
- `branches`
- `items`
- `stock`
- `pricing`
- `customers`
- `pos`

These facades wrap existing Frappe Resource APIs and `aimatic.offline_pos.api` methods. They do not reproduce ERPNext pricing, stock, tax, permission, or submission rules.

Restaurant, Sales Orders, Shopping, and Delivery APIs will be added only in their implementation phases, after inspecting standard ERPNext APIs and the local Ai Matic Frappe app. No placeholder endpoint is treated as a working contract.
