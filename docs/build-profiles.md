# Ai Matic Build Profiles

`src/config/product-profiles.json` is the build-profile source of truth. Every profile declares its product ID, name, allowed platforms, Android application ID, storage namespace, authentication mode, and features.

## Enabled Phase 1 builds

```text
npm run build:pos:electron
npm run build:pos:android:web
npm run android:pos:sync
npm run android:pos:apk
```

The original commands remain supported and continue to build Retail POS:

```text
npm run build
npm run dist
npm run android:sync
npm run android:apk
```

Setting `AI_MATIC_PRODUCT` to Restaurant, Sales, or Shopping currently fails with a phase guard. This prevents an unfinished or unrelated product from being released accidentally.

Electron remains a POS-only target. New Android products will receive distinct application IDs and storage namespaces when their implementation phases begin.
