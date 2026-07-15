# Android Authentication Security

## Decision

Long-lived ERPNext API keys and API secrets must not be embedded in an APK. They also should not be entered and retained on general-purpose customer or staff phones.

Retail POS Android no longer accepts or stores operator-supplied terminal credentials. Its API Key/API Secret controls are removed from the packaged Android HTML. Electron independently retains terminal-token credentials for desktop operation.

Restaurant and Sales profiles require authenticated staff sessions. Shopping requires a restricted customer session. Their profiles cannot select `terminal-token` authentication.

## Implemented Android POS flow

The Android POS flow is:

1. Connect only to an HTTPS ERPNext site.
2. Scan and redeem a supervisor-generated, one-time device-enrollment QR code for a POS Profile. Camera access is requested only for this explicit scan; manual paste is retained as a fallback.
3. Receive a random device proof and store it with the public device configuration through Android Keystore-backed encrypted storage; the server stores only its hash.
4. Authenticate the cashier in the system browser using OAuth2 Authorization Code with PKCE (`S256`).
5. Store access/refresh tokens through the same native secure-storage bridge.
6. Refresh once on a 401 and retry the request once; a rejected refresh clears the mobile session.
7. Send the device ID/proof on every token exchange, refresh, and Android POS API request so ERPNext can enforce device status and POS Profile before deriving the cashier from the authenticated Bearer session.

The device proof is not an API key/API secret and cannot authenticate a cashier. The public OAuth client contains no client secret. The server rotates refresh tokens and treats reuse of a rotated token as replay, revoking the affected user/client token family. Invalid device proof revokes the affected OAuth token; disabling a device blocks its next online request.

## Platform boundary

Electron continues using its established terminal-token path and optional first-run provisioning. Android must never fall back to those credentials. Shared request code selects one explicit authentication mode:

- `terminal-token` for Electron;
- `user-session` for employee Android products;
- `customer-session` for Shopping.

See [Android device and cashier authentication](android-authentication.md) for enrollment, callback, storage, revocation, and validation details.

The Shopping build must never contain terminal credentials, internal ERPNext users, unrestricted Resource API access, or administrative data.
