# VnSlot 888 for Android (Google Play)

A Trusted Web Activity: a small native app that opens https://vnslot888.online
full-screen. Generated with Google's Bubblewrap (`@bubblewrap/core`); the game
itself still lives on the website, so website updates reach the app instantly.

- Package name: `online.vnslot888.twa`
- Settings: `twa-manifest.json` (regenerate the project with `generate.js` after changing them)

## The signing key

`upload.jks` is **not** in this repository and must never be committed. Keep it
and its password somewhere safe (a password manager). It is the *upload key*:
Google Play re-signs the app with its own *app signing key*. If the upload key
is lost, it can be reset from Play Console (Setup → App signing).

## Making a new version

1. Raise `versionCode` (and `versionName`) in `app/build.gradle`. Every upload needs a higher `versionCode`.
2. Build (needs JDK 17+ and the Android SDK, platform 36):
   ```sh
   ./gradlew bundleRelease
   ```
3. Sign:
   ```sh
   jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore upload.jks \
     app/build/outputs/bundle/release/app-release.aab upload
   ```
4. Upload the `.aab` in Play Console.

## Full-screen (no browser bar)

The app only opens without a browser bar if the site proves it owns the app.
The server publishes `/.well-known/assetlinks.json` from two environment
variables on Railway:

- `ANDROID_PACKAGE`: defaults to `online.vnslot888.twa`
- `ANDROID_CERT_SHA256`: comma-separated SHA-256 fingerprints. List both the upload
  key and the Play app signing key (Play Console → Setup → App signing).
