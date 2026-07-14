# Android Authentication Security

## Decision

Long-lived ERPNext API keys and API secrets must not be embedded in an APK. They also should not be entered and retained on general-purpose customer or staff phones.

The existing Retail POS APK currently stores operator-supplied terminal credentials in Android application storage. They are not compiled into the APK, but they are long-lived bearer credentials. Phase 1 preserves this mode only for compatibility with the working Retail POS server contract.

Restaurant and Sales profiles require authenticated staff sessions. Shopping requires a restricted customer session. Their profiles cannot select `terminal-token` authentication.

## Target flow

The production mobile flow should be:

1. Connect to an HTTPS ERPNext site.
2. Authenticate the individual staff member or customer through a server-supported login/OAuth flow.
3. Receive a short-lived session or access token scoped to that user.
4. Store session material using platform-protected storage where supported.
5. Let ERPNext enforce roles and document permissions on every request.
6. Revoke or expire the session without rebuilding the APK.

OAuth Authorization Code with PKCE is preferred when the ERPNext deployment supports it. A server-issued session-cookie flow is also possible, but cross-origin cookie, CSRF, Capacitor HTTP, and logout behavior must be tested against the deployed ERPNext version.

## Migration rule for Retail POS Android

Do not remove the API Key/API Secret fields from the current POS APK until the Ai Matic Frappe app provides and tests an equivalent device-enrollment or staff-session contract for:

- catalogue and customer synchronization;
- POS Profile and shift access;
- cart validation and sale submission;
- offline queue replay and duplicate prevention;
- refunds and supervisor authorization.

After that contract exists, migrate existing POS installations explicitly, clear stored terminal secrets, and remove the fields from Android UI. Electron terminal authentication can remain independently configurable.

The Shopping build must never contain terminal credentials, internal ERPNext users, unrestricted Resource API access, or administrative data.
