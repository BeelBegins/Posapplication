import type { PosCoreDeps } from "./types";
import { createHttpCore } from "./http";
import { createCatalogSyncCore } from "./catalog-sync";
import { createPosSessionCore } from "./pos-session";
import { createPosConfigCore } from "./pos-config";
import { createSaleRefundCore } from "./sale-refund";
import { createReleasesCore } from "./releases";
import { createGiftVoucherCore } from "./gift-voucher";
import { createVoidLogCore } from "./void-log";

export * from "./types";
export * from "./http";

/**
 * Assembles the platform-agnostic POS business logic (ERP HTTP calls,
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
    ...createGiftVoucherCore(deps),
    ...createCatalogSyncCore(deps, http),
    ...posSession,
    ...createPosConfigCore(deps, http),
    ...createSaleRefundCore(deps, http, posSession),
    ...createReleasesCore(deps),
    ...createVoidLogCore(deps, () => posSession.getCartIdentity())
  };
}
