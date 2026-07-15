# Ai Matic Build Profiles

`src/config/product-profiles.json` is the build-profile source of truth. Every profile declares its product ID, name, allowed platforms, Android application ID and launch orientation, storage namespace, authentication mode, and features. Android products launch sensor-aware portrait; Electron has no orientation constraint.

## Enabled builds

```text
npm run build:pos:electron
npm run build:pos:android:web
npm run android:pos:sync
npm run android:pos:apk
npm run build:restaurant:android:web
npm run android:restaurant:sync
npm run android:restaurant:apk
npm run build:sales:android:web
npm run android:sales:apk
npm run build:shopping:android:web
npm run android:shopping:apk
npm run build:shopping:web
```

The original commands remain supported and continue to build Retail POS:

```text
npm run build
npm run dist
npm run android:sync
npm run android:apk
```

Restaurant, Sales, and Shopping are enabled focused builds with separate application IDs. Shopping exposes the customer-safe COD / Store Pickup flow backed by its restricted server API. Restaurant is a complete, isolated waiter UX prototype using local mock data until its permission-enforcing ERPNext integration is implemented.

Electron remains a POS-only target. POS, Restaurant, Sales, and Shopping Android builds have distinct application IDs and storage namespaces. The release workflow publishes all four APKs plus the Shopping web bundle. Deploy the web bundle only at the exact HTTPS origin/callback configured in ERPNext Shopping Settings.

The native ML Kit barcode plugin is included only in POS and Sales, where scanning is live. Restaurant's scanner affordance remains a prototype action until the real catalogue repository is connected, so its APK stays lightweight; Shopping has no scanner workflow.
