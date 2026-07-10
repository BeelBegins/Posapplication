import type { PosCoreDeps } from "./types";

export * from "./types";

/**
 * Assembles the platform-agnostic POS business logic (ERPNext HTTP calls,
 * sale/session/refund orchestration) into one object, bound to the given deps.
 * Empty for now — populated one group at a time per the extraction plan
 * (see /home/nabeel/.claude/plans/parallel-nibbling-moler.md), so main.ts's IPC
 * handlers can be rewired incrementally without a single large-scale rewrite.
 */
export function createPosCore(_deps: PosCoreDeps) {
  return {};
}
