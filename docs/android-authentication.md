# Android device and cashier authentication

Ai Matic POS Android does not accept, embed, or persist an ERPNext API key/API secret. Electron keeps its existing terminal-token flow unchanged.

## First installation

1. A POS Supervisor or System Manager calls `aimatic.offline_pos.api.generate_device_enrollment_code` for one POS Profile and renders the returned JSON as a QR code.
2. The Android enrollment screen scans that QR directly with the back camera. Manual paste remains available as a fallback.
3. The APK generates a per-install hardware UUID and redeems the one-time, ten-minute token over HTTPS.
4. ERPNext binds the hardware UUID to the selected POS Profile and returns public device configuration, the public OAuth client ID, and a random per-install device proof. Only a SHA-256 hash of that proof is stored on the server.
5. The device configuration and proof are stored through Android Keystore-backed encrypted storage. The proof is not an ERPNext API key, API secret, or user session and cannot authorize requests by itself.

Reinstalling or clearing application data generates a new hardware UUID and requires enrollment again.

## Cashier login

Android uses OAuth2 Authorization Code with PKCE (`S256`) through the system browser. The redirect is `com.beelbegins.aimaticpos://oauth/callback` and is handled by a dedicated Android intent filter.

- A random state and PKCE verifier are generated for every authorization.
- The callback scheme, host, path, and state must all match before code exchange.
- Access and refresh tokens are stored only in encrypted native storage.
- A single 401 triggers at most one refresh and one retry.
- Concurrent refreshes share one request.
- Refresh rotation replaces the stored refresh token atomically.
- A rejected/replayed refresh clears the local session; it never falls back to terminal credentials.
- Token exchanges, refreshes, and every Android POS Bearer request carry the hardware UUID and device proof in dedicated headers.
- The server verifies the proof against its stored hash, rejects disabled devices, and binds the request to the enrolled POS Profile before endpoint code runs.
- Profile-scoped POS endpoints additionally reject attempts to use another POS Profile, and the server derives the cashier from the Bearer-authenticated Frappe session.
- Missing or invalid proof revokes the affected access or refresh token and clears the local session on the client. Disabling a device therefore blocks its next online call even if a previously issued OAuth token has not expired.

Offline cashier PINs remain local and support offline sales after a successful online OAuth login. They are not ERPNext passwords or OAuth tokens.

## Platform separation

The secure-storage plugin, system-browser plugin, and deep-link listener are loaded only by the Capacitor POS bundle. Electron does not import them and continues using its existing API-key/API-secret settings and request path.

## Release checks

- Run `npm test`.
- Run `npm run android:pos:apk` and inspect the APK manifest for the exact callback intent filter.
- On first launch, confirm camera permission is requested only when **Scan enrollment QR** is pressed and that cancelling returns safely to the enrollment screen.
- Confirm the APK HTML has no API Key/API Secret inputs.
- Run the Electron build to guard the terminal-token path.
- On a test device: enroll, log in, rotate through a refresh, submit an online sale, queue an offline sale, disable the device, and verify its next server call is rejected.
