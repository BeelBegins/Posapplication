import { createApiClient, type CredentialProvider } from "../../api/client";

export interface InteractiveCustomerCredentials extends CredentialProvider {
  login(): Promise<string>;
  clear(): Promise<void>;
}

/**
 * Customer Shopping uses its own OAuth/public-session credential provider.
 * It deliberately cannot accept terminal API keys and therefore cannot fall
 * back to the POS service account or inherit an employee session.
 */
export function createShoppingAuthenticatedClient(input: {
  baseUrl: string;
  credentials: InteractiveCustomerCredentials;
  fetch: typeof fetch;
}) {
  return {
    client: createApiClient({ baseUrl: input.baseUrl, authentication: { mode: "customer-session", credentials: input.credentials }, fetch: input.fetch }),
    signIn: () => input.credentials.login(),
    signOut: () => input.credentials.clear()
  };
}
