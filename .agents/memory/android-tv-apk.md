---
name: Android TV APK wrapper
description: How the OBTV /tv site is packaged as an Android TV app and why it builds in CI.
---

The Android TV app lives in `android-tv/` and is a single full-screen WebView
(`io.obtv.tv`) that loads `https://studios.obtv.io/tv` (URL externalized in
`res/values/strings.xml` → `app_url`).

**Why CI-only builds:** the Replit dev env has no JDK/Gradle/Android SDK, so the
APK cannot be built here. `.github/workflows/android-tv-apk.yml` builds it in the
cloud (setup-java 17 + android-actions/setup-android, `assembleDebug`) and
uploads `app-debug.apk` as an artifact. Stack: AGP 8.5.2 / Gradle 8.7 / JDK 17 /
compileSdk+targetSdk 34 / minSdk 21. The wrapper jar is committed
(`gradle/wrapper/gradle-wrapper.jar`).

**WebView invariants (don't regress):**
- `setDomStorageEnabled(true)` is REQUIRED — the /tv site keeps the JWT in
  localStorage; without it auth silently breaks.
- `setMediaPlaybackRequiresUserGesture(false)` — live streams must autoplay.
- HTML5 fullscreen video needs `WebChromeClient` onShowCustomView/onHideCustomView;
  Back button must exit fullscreen first, then WebView history, before finishing.
- `FLAG_KEEP_SCREEN_ON` so the lean-back player doesn't sleep.

**TV launcher:** manifest needs both `LAUNCHER` and `LEANBACK_LAUNCHER`
categories + `android:banner`; leanback/touchscreen uses-feature are
`required="false"` so it installs on phones too (acceptable for sideload).

It's a debug build (Android debug key) — fine for sideloading, NOT Play Store.
Release distribution would need a real signing key.
