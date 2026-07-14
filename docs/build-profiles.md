# Ai Matic Build Profiles

`src/config/product-profiles.json` is the build-profile source of truth. Every profile declares its product ID, name, allowed platforms, Android application ID, storage namespace, authentication mode, and features.

## Enabled builds

```text
npm run build:pos:electron
npm run build:pos:android:web
npm run android:pos:sync
npm run android:pos:apk
npm run build:restaurant:android:web
npm run android:restaurant:sync
npm run android:restaurant:apk
```

The original commands remain supported and continue to build Retail POS:

```text
npm run build
npm run dist
npm run android:sync
npm run android:apk
```

Setting `AI_MATIC_PRODUCT` to Sales or Shopping currently fails with a phase guard. Restaurant is buildable during Phase 2, but is not included in the release workflow until its backend and authentication integration pass.

Electron remains a POS-only target. POS and Restaurant Android builds have distinct application IDs and storage namespaces.
