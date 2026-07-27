---
name: posapplication-release
description: Use for any Posapplication version bump, push or merge to main, GitHub Actions release, Windows NSIS build, Android APK/AAB, Shopping PWA, signing, tags/assets, updater, Play Store preparation, or troubleshooting the combined release pipeline.
---

# Posapplication release

Every `main` push triggers tests and builds/publishes Windows POS, four Android
products and Shopping web artifacts. No path filter makes documentation-only
main pushes releases too.

## Gate

1. Confirm the user intends a release of all products.
2. Rebase/merge the reviewed non-release branch intentionally.
3. Bump `package.json` version; never reuse a release version/tag.
4. Run `npm run build` and `npm test` plus affected product builds.
5. Complete manual POS/native/product smoke gates from `docs/architecture.md`.
6. Confirm signing secrets/keystores remain external.
7. Push `main`, monitor every workflow job, and verify the combined release
   contains all required artifacts before announcing success.

Local `dist-apk/`, debug APKs or `npm run release` are not proof of the real CI
release. Restaurant must not ship production behavior backed by demo data.
Guidance-only changes remain on a non-release branch until the next intentional
versioned release.
