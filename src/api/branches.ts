import type { ApiClient } from "./client";

export function createBranchesApi(client: ApiClient) {
  return {
    listBranches: (fields: string[] = ["name", "company"], filters?: unknown, init?: RequestInit) =>
      client.listResources("Branch", { fields, filters }, init)
  };
}
