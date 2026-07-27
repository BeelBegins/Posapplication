# POS persistence

SQLite/cache/queue schema changes are versioned migrations. Preserve existing
terminal data, durable request IDs, queue recovery and the compile-time
`IDatabaseService` contract. Large catalogue storage stays separate from
transaction/session state. Endpoint or credential changes clear the documented
site-scoped cache; cosmetic settings remain.

Test upgrades from prior schemas, restart during sync, duplicate replay and
partial failure. Never silently drop queued sales.
