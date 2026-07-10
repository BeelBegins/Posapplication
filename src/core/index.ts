import type { PosCoreDeps } from "./types";
import { createHttpCore } from "./http";
import { createCatalogSyncCore } from "./catalog-sync";
import { createPosSessionCore } from "./pos-session";
import { createPosConfigCore } from "./pos-config";
import { createSaleRefundCore } from "./sale-refund";

export * from "./types";
export * from "./http";

/**
 * Assembles the platform-agnostic POS business logic (ERPNext HTTP calls,
 * sale/session/refund orchestration) into one object, bound to the given deps.
 * Populated one group at a time per the extraction plan
 * (see /home/nabeel/.claude/plans/parallel-nibbling-moler.md), so main.ts's IPC
 * handlers can be rewired incrementally without a single large-scale rewrite.
 */
export function createPosCore(deps: PosCoreDeps) {
  const http = createHttpCore(deps);
  const posSession = createPosSessionCore(deps);
  return {
    ...http,
    ...createCatalogSyncCore(deps, http),
    ...posSession,
    ...createPosConfigCore(deps, http),
    ...createSaleRefundCore(deps, http, posSession)
  };
}
